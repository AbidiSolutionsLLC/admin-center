// NOT USED FOR GO-LIVE (fresh start decided 2026-11-13: no previous data is migrated; see
// ecosystem-planning/phase-1-architecture/11-SEEDING-AND-CUTOVER-PLAN.md §0). Kept for reference and tests only.
// server/src/scripts/send-claim-emails.ts
/**
 * 03 §4.3, 11 §3 step 6: Send "claim your account" and invitation emails to seeded/migrated users.
 * Targets:
 *   - Active members whose identity has no usable password (S4 placeholder hash) and no federated links -> claim email
 *   - Invited members -> standard welcome/invitation email
 *   - Entra-linked members are skipped.
 * Idempotent: Skips users with an existing unused, unexpired InviteToken unless --resend is specified.
 */
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { User, IUser } from '../models/User.model';
import { Identity, IIdentity } from '../models/Identity.model';
import { Company, ICompany } from '../models/Company.model';
import { Invitation } from '../models/Invitation.model';
import { createInvitation, inviteLink } from '../lib/invitations';
import { sendClaimEmail, sendWelcomeEmail } from '../lib/emailService';

export const PLACEHOLDER_PASSWORD_HASH = '$2b$12$unmigrated_seeded_password_placeholder';

export interface SendClaimEmailsOptions {
  orgId?: string;
  dryRun?: boolean;
  resend?: boolean;
  clientUrl?: string;
  claimEmailSender?: typeof sendClaimEmail;
  welcomeEmailSender?: typeof sendWelcomeEmail;
}

export interface SendClaimEmailsStats {
  scanned: number;
  claimTargets: number;
  inviteTargets: number;
  skippedFederated: number;
  skippedHasPassword: number;
  skippedInactive: number;
  skippedHasActiveToken: number;
  emailsSent: number;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): { orgId?: string; dryRun: boolean; resend: boolean } {
  let orgId: string | undefined;
  let dryRun = true;
  let resend = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--real') {
      dryRun = false;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--resend') {
      resend = true;
    } else if (arg === '--org-id' && i + 1 < argv.length) {
      orgId = argv[++i];
    } else if (arg.startsWith('--org-id=')) {
      orgId = arg.split('=')[1];
    }
  }

  return { orgId, dryRun, resend };
}

export function isUsablePassword(hash?: string | null): boolean {
  if (!hash) return false;
  if (hash === PLACEHOLDER_PASSWORD_HASH) return false;
  if (hash.includes('unmigrated_seeded_password_placeholder')) return false;
  return hash.length >= 20; // real bcrypt hash is ~60 chars
}

export async function runSendClaimEmails(options: SendClaimEmailsOptions = {}): Promise<SendClaimEmailsStats> {
  const dryRun = options.dryRun !== undefined ? options.dryRun : true;
  const resend = options.resend ?? false;
  const clientUrl = (options.clientUrl || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const sendClaim = options.claimEmailSender || sendClaimEmail;
  const sendWelcome = options.welcomeEmailSender || sendWelcomeEmail;

  const stats: SendClaimEmailsStats = {
    scanned: 0,
    claimTargets: 0,
    inviteTargets: 0,
    skippedFederated: 0,
    skippedHasPassword: 0,
    skippedInactive: 0,
    skippedHasActiveToken: 0,
    emailsSent: 0,
    dryRun,
  };

  const userQuery: Record<string, unknown> = {};
  if (options.orgId) {
    if (!Types.ObjectId.isValid(options.orgId)) {
      throw new Error(`Invalid --org-id: "${options.orgId}" is not a valid ObjectId`);
    }
    userQuery.company_id = new Types.ObjectId(options.orgId);
  }

  const users = await User.find(userQuery).populate<{ company_id: ICompany }>('company_id').lean();
  const identityIds = users.map(u => u.identity_id).filter(Boolean);
  const identities = await Identity.find({ _id: { $in: identityIds } }).lean();
  const identityMap = new Map(identities.map(idn => [idn._id.toString(), idn]));

  for (const user of users) {
    stats.scanned++;

    const identity = user.identity_id ? identityMap.get(user.identity_id.toString()) : null;
    const company = user.company_id as unknown as ICompany;
    const companyName = company?.name || 'Karbexa';

    // 1. Check if user is federated (Entra-linked) -> skipped
    const isFederated = !!(identity?.federated_links && identity.federated_links.length > 0);
    if (isFederated) {
      stats.skippedFederated++;
      continue;
    }

    // 2. Check lifecycle state
    const lifecycleState = user.lifecycle_state;
    let targetType: 'claim' | 'invite' | null = null;

    if (lifecycleState === 'active') {
      const hasPassword = isUsablePassword(identity?.password_hash);
      if (hasPassword) {
        stats.skippedHasPassword++;
        continue;
      }
      targetType = 'claim';
      stats.claimTargets++;
    } else if (lifecycleState === 'invited') {
      targetType = 'invite';
      stats.inviteTargets++;
    } else {
      stats.skippedInactive++;
      continue;
    }

    // 3. Idempotency check: see if user already has an unused, unexpired token
    const now = new Date();
    const existingToken = await Invitation.findOne({
      user_id: user._id,
      state: 'pending',
      expires_at: { $gt: now },
    });

    if (existingToken && !resend) {
      stats.skippedHasActiveToken++;
      continue;
    }

    // 4. Create token and dispatch email if not dry-run
    if (!dryRun) {
      // createInvitation supersedes the previous pending invitation, so --resend needs no separate expiry step.
      const { rawToken } = await createInvitation(null, {
        kind: 'member', company_id: company?._id ?? null, user_id: user._id, email: user.email,
        created_by: { type: 'system' },
      });
      const setupLink = inviteLink(rawToken, user.email, clientUrl);

      if (targetType === 'claim') {
        await sendClaim({
          email: user.email,
          full_name: user.full_name,
          company_name: companyName,
          claim_link: setupLink,
        });
      } else {
        await sendWelcome({
          email: user.email,
          full_name: user.full_name,
          employee_id: user.employee_id || '',
          company_name: companyName,
          invite_link: setupLink,
        });
      }

      stats.emailsSent++;
    }
  }

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('===============================================================');
  console.log(` KARBEXA CLAIM & INVITATION EMAILS DISPATCHER (${args.dryRun ? 'DRY RUN' : 'REAL RUN'})`);
  console.log('===============================================================');
  if (args.orgId) console.log(`Scoped to Organization: ${args.orgId}`);
  if (args.resend) console.log('Resend mode enabled: will re-issue tokens for active unused tokens.');

  const { connectDB } = await import('../config/db');
  await connectDB();

  try {
    const stats = await runSendClaimEmails(args);
    console.log('\nDISPATCH SUMMARY:');
    console.log(`  Scanned Users:             ${stats.scanned}`);
    console.log(`  Claim Targets (Active):    ${stats.claimTargets}`);
    console.log(`  Invite Targets (Invited):  ${stats.inviteTargets}`);
    console.log(`  Skipped (Federated):       ${stats.skippedFederated}`);
    console.log(`  Skipped (Has Password):    ${stats.skippedHasPassword}`);
    console.log(`  Skipped (Inactive/Other):  ${stats.skippedInactive}`);
    console.log(`  Skipped (Active Token):    ${stats.skippedHasActiveToken}`);
    console.log(`  Emails Sent:               ${stats.emailsSent}`);
    if (stats.dryRun) {
      console.log('\nDRY-RUN COMPLETE: No tokens written, no emails sent.');
      console.log('Pass --real to execute real email delivery.');
    } else {
      console.log('\nREAL RUN COMPLETE: All claim and invitation tokens generated and sent.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error in send-claim-emails:', err);
    process.exit(1);
  });
}
