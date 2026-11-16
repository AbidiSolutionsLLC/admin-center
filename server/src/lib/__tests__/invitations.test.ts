// Plan 2.1: createInvitation / createInvitations / inviteLink. In-memory MongoDB, no session (standalone).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Invitation } from '../../models/Invitation.model';
import { createInvitation, createInvitations, inviteLink } from '../invitations';

let mongo: MongoMemoryServer;
const company = new Types.ObjectId();

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'invitations_test' });
  await Invitation.init();
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await Invitation.deleteMany({}); });

const base = (user: Types.ObjectId, email = 'A@Example.com') => ({
  kind: 'member' as const, company_id: company, user_id: user, email, created_by: { type: 'system' as const },
});

test('creates a pending invitation: hash stored, raw token returned, e-mail lower-cased, 72 h default', async () => {
  const user = new Types.ObjectId();
  const before = Date.now();
  const { invitation, rawToken } = await createInvitation(null, base(user));
  assert.match(rawToken, /^[0-9a-f]{64}$/);
  assert.equal(invitation.token_hash, crypto.createHash('sha256').update(rawToken).digest('hex'));
  assert.equal(invitation.state, 'pending');
  assert.equal(invitation.email, 'a@example.com');
  const hours = (invitation.expires_at.getTime() - before) / 3600000;
  assert.ok(hours > 71.9 && hours < 72.1);
});

test('a second invitation supersedes the first and records which one replaced it', async () => {
  const user = new Types.ObjectId();
  const first = await createInvitation(null, base(user));
  const second = await createInvitation(null, { ...base(user), ttl_hours: 1 });
  const old = await Invitation.findById(first.invitation._id);
  assert.equal(old!.state, 'superseded');
  assert.equal(String(old!.superseded_by), String(second.invitation._id));
  assert.equal((await Invitation.countDocuments({ user_id: user, state: 'pending' })), 1);
});

test('supersede only touches the same user', async () => {
  const a = new Types.ObjectId(); const b = new Types.ObjectId();
  await createInvitation(null, base(a));
  await createInvitation(null, base(b, 'b@example.com'));
  await createInvitation(null, base(a));
  assert.equal(await Invitation.countDocuments({ user_id: b, state: 'pending' }), 1);
});

test('batched variant: one pending row per user, order of results matches the input', async () => {
  const a = new Types.ObjectId(); const b = new Types.ObjectId();
  await createInvitation(null, base(a));
  const out = await createInvitations(null, [base(a), base(b, 'b@example.com')]);
  assert.equal(out.length, 2);
  assert.equal(String(out[0].invitation.user_id), String(a));
  assert.equal(String(out[1].invitation.user_id), String(b));
  assert.equal(await Invitation.countDocuments({ state: 'pending' }), 2);
  assert.equal(await Invitation.countDocuments({ state: 'superseded' }), 1);
  assert.deepEqual(await createInvitations(null, []), []);
});

test('operator invitations carry no company', async () => {
  const { invitation } = await createInvitation(null, { ...base(new Types.ObjectId()), kind: 'operator', company_id: null });
  assert.equal(invitation.company_id, null);
});

test('the model has no TTL index (a TTL would erase the evidence)', async () => {
  const indexes = await Invitation.collection.indexes();
  assert.equal(indexes.filter((i) => i.expireAfterSeconds !== undefined).length, 0);
});

test('inviteLink builds the one onboarding URL format', () => {
  assert.equal(inviteLink('tok', 'a+b@x.com', 'https://app.test/'), 'https://app.test/onboarding?token=tok&email=a%2Bb%40x.com');
});

// ── Plan 2.2 ────────────────────────────────────────────────────────────────

import { consumeInvitation, invitationProblem, maskEmail } from '../invitations';

test('two concurrent accepts of one invitation: exactly one succeeds', async () => {
  const { rawToken } = await createInvitation(null, base(new Types.ObjectId()));
  const results = await Promise.all([consumeInvitation(null, rawToken), consumeInvitation(null, rawToken)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(await Invitation.countDocuments({ state: 'accepted' }), 1);
});

test('an expired, superseded, accepted or revoked invitation cannot be consumed', async () => {
  const user = new Types.ObjectId();
  const expired = await createInvitation(null, { ...base(user), ttl_hours: -1 });
  assert.equal(await consumeInvitation(null, expired.rawToken), null);
  const old = await createInvitation(null, base(user));
  await createInvitation(null, base(user));
  assert.equal(await consumeInvitation(null, old.rawToken), null);
  const other = await createInvitation(null, base(new Types.ObjectId(), 'r@example.com'));
  await Invitation.updateOne({ _id: other.invitation._id }, { $set: { state: 'revoked' } });
  assert.equal(await consumeInvitation(null, other.rawToken), null);
});

test('operator invitations are not served by the member accept step', async () => {
  const { rawToken } = await createInvitation(null, { ...base(new Types.ObjectId()), kind: 'operator', company_id: null });
  assert.equal(await consumeInvitation(null, rawToken), null);
});

test('invitationProblem returns the code and HTTP status for each of the six outcomes', async () => {
  const now = new Date();
  const row = (state: string, expires: number) => ({ state, expires_at: new Date(now.getTime() + expires), updatedAt: now }) as any;
  assert.equal(invitationProblem(row('pending', 1000), now), null);
  assert.deepEqual(['INVITE_EXPIRED', 410], [invitationProblem(row('pending', -1000), now)!.code, invitationProblem(row('pending', -1000), now)!.status]);
  assert.deepEqual(['INVITE_SUPERSEDED', 410], [invitationProblem(row('superseded', 1000), now)!.code, invitationProblem(row('superseded', 1000), now)!.status]);
  assert.deepEqual(['INVITE_ALREADY_USED', 409], [invitationProblem(row('accepted', 1000), now)!.code, invitationProblem(row('accepted', 1000), now)!.status]);
  assert.deepEqual(['INVITE_REVOKED', 410], [invitationProblem(row('revoked', 1000), now)!.code, invitationProblem(row('revoked', 1000), now)!.status]);
  assert.deepEqual(['INVITE_NOT_FOUND', 404], [invitationProblem(null, now)!.code, invitationProblem(null, now)!.status]);
});

test('maskEmail keeps the first letter and the domain', () => {
  assert.equal(maskEmail('jane.doe@x.com'), 'j•••@x.com');
  assert.equal(maskEmail('nonsense'), '•••');
});
