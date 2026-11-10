// server/src/scripts/migrate-identities.ts
// Idempotent identity backfill (03 §1.1/§1.2): every User without identity_id gets the Identity for
// its lowercase email (found or created) and is linked to it. Safe to re-run.
//   npm run migrate:identities            (add -- --dry-run to only report)
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { User, Identity } from '../models';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');
  await mongoose.connect(uri, { dbName: process.env.DB_NAME ?? 'admin_center' });
  await Identity.syncIndexes();

  const stats = { scanned: 0, linkedExisting: 0, created: 0, skipped: 0 };
  const cursor = User.find({ identity_id: { $exists: false } })
    .select('email full_name password_hash previous_password_hashes password_changed_at lifecycle_state is_active')
    .sort({ created_at: 1 })
    .cursor();

  for await (const user of cursor) {
    stats.scanned++;
    const email = (user.email || '').trim().toLowerCase();
    if (!email) {
      stats.skipped++;
      console.warn(`[migrate-identities] user ${user._id} has no email — skipped`);
      continue;
    }

    let identity = await Identity.findOne({ email });
    if (identity) {
      stats.linkedExisting++;
    } else {
      stats.created++;
      if (!dryRun) {
        const wasActive = user.lifecycle_state === 'active' || user.is_active === true;
        try {
          identity = await Identity.create({
            email,
            full_name: user.full_name,
            password_hash: user.password_hash || undefined,
            previous_password_hashes: user.previous_password_hashes || [],
            password_changed_at: user.password_changed_at,
            ...(wasActive ? { email_verified_at: new Date() } : {}),
            status: 'active',
          });
        } catch (err: any) {
          if (err?.code !== 11000) throw err; // raced with another run: reuse the winner
          identity = await Identity.findOne({ email });
        }
      }
    }

    if (!dryRun && identity) {
      await User.updateOne({ _id: user._id, identity_id: { $exists: false } }, { $set: { identity_id: identity._id } });
    }
  }

  console.log(`[migrate-identities] ${dryRun ? '(dry run) ' : ''}${JSON.stringify(stats)}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('[migrate-identities] failed', err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
