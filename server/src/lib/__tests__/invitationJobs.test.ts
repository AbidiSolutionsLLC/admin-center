// Plan 2.7: reminder and retention jobs with a fixed clock. In-memory MongoDB; mail goes through nodemailer's JSON
// transport (MOCK_EMAIL), so nothing leaves the process.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
process.env.MOCK_EMAIL = 'true';
process.env.NODE_ENV = 'development';

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Invitation } from '../../models/Invitation.model';
import { EmailDelivery } from '../../models/EmailDelivery.model';
import { User, IUser } from '../../models/User.model';
import { Company } from '../../models/Company.model';
import { createInvitation } from '../invitations';
import { sendInvitationReminders, purgeFinishedInvitations, RETENTION_DAYS } from '../invitationJobs';

let mongo: MongoMemoryServer;
let companyId: Types.ObjectId;
const HOUR = 3600 * 1000;
const now = new Date('2026-11-16T12:00:00Z');

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invitation_jobs' });
  await Invitation.init();
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Invitation.deleteMany({}), EmailDelivery.deleteMany({}), User.deleteMany({}), Company.deleteMany({})]);
  companyId = (await Company.create({ name: 'Reminder Co', slug: `reminder-${Date.now()}` }))._id as Types.ObjectId;
});

async function member(tag: string, lifecycle_state: IUser['lifecycle_state'] = 'invited') {
  return User.create({ company_id: companyId, full_name: `M ${tag}`, email: `${tag}@reminder.test`, password_hash: 'x', lifecycle_state, is_active: false });
}
/** An invitation that expires `hoursLeft` hours after `now`. */
async function invitationExpiringIn(user: { _id: Types.ObjectId; email: string }, hoursLeft: number) {
  const { invitation } = await createInvitation(null, {
    kind: 'member', company_id: companyId, user_id: user._id, email: user.email, created_by: { type: 'system' },
  });
  await Invitation.updateOne({ _id: invitation._id }, { $set: { expires_at: new Date(now.getTime() + hoursLeft * HOUR) } });
  return invitation;
}

test('reminds only invitations expiring in 23 to 24 hours, once, and stamps the row', async () => {
  const a = await member('a'); const b = await member('b'); const c = await member('c');
  const inWindow = await invitationExpiringIn(a, 23.5);
  await invitationExpiringIn(b, 30);
  await invitationExpiringIn(c, 10);

  assert.equal(await sendInvitationReminders(now), 1);
  const stamped = await Invitation.findById(inWindow._id);
  assert.ok(stamped!.reminder_sent_at);
  assert.equal(await Invitation.countDocuments({ reminder_sent_at: { $ne: null } }), 1);

  const mail = await EmailDelivery.find({ template: 'invite_reminder' });
  assert.equal(mail.length, 1);
  assert.equal(mail[0].to, 'a@reminder.test');
  assert.equal(String(mail[0].company_id), String(companyId));

  assert.equal(await sendInvitationReminders(now), 0); // second tick: nothing more to do
  assert.equal(await EmailDelivery.countDocuments({ template: 'invite_reminder' }), 1);
});

test('no reminder for a member who is no longer invited, or for a non-pending invitation', async () => {
  const active = await member('active', 'active');
  await invitationExpiringIn(active, 23.5);
  const revoked = await member('revoked');
  const rev = await invitationExpiringIn(revoked, 23.5);
  await Invitation.updateOne({ _id: rev._id }, { $set: { state: 'revoked' } });

  assert.equal(await sendInvitationReminders(now), 0);
  assert.equal(await EmailDelivery.countDocuments({ template: 'invite_reminder' }), 0);
});

test('retention deletes finished invitations after 180 days and keeps everything else', async () => {
  const old = new Date(now.getTime() - (RETENTION_DAYS + 1) * 24 * HOUR);
  const recent = new Date(now.getTime() - (RETENTION_DAYS - 1) * 24 * HOUR);
  const mk = async (tag: string, state: string, updatedAt: Date) => {
    const u = await member(tag);
    const { invitation } = await createInvitation(null, { kind: 'member', company_id: companyId, user_id: u._id, email: u.email, created_by: { type: 'system' } });
    // timestamps would overwrite updatedAt on a normal update, so write it through the driver
    await Invitation.collection.updateOne({ _id: invitation._id }, { $set: { state, updatedAt } });
    return invitation._id;
  };
  const oldAccepted = await mk('o1', 'accepted', old);
  const oldRevoked = await mk('o2', 'revoked', old);
  const oldSuperseded = await mk('o3', 'superseded', old);
  const oldPending = await mk('o4', 'pending', old);
  const recentAccepted = await mk('o5', 'accepted', recent);

  assert.equal(await purgeFinishedInvitations(now), 3);
  const left = (await Invitation.find({}).select('_id')).map((d) => String(d._id)).sort();
  assert.deepEqual(left, [String(oldPending), String(recentAccepted)].sort());
  assert.ok(![oldAccepted, oldRevoked, oldSuperseded].some((id) => left.includes(String(id))));
});
