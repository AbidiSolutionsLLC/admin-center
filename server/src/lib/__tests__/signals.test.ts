// Plan 4.10: attention rules (DRD 4.4), reconcile (upsert / resolve), the 10 minute sync_lag wait, daily stats. In-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSignals, computeDailyStats, seatSignal, syncLagging, startOfDay } from '../signals';
import { Company } from '../../models/Company.model';
import { User } from '../../models/User.model';
import { OrganizationEntitlement } from '../../models/OrganizationEntitlement.model';
import { SeatUsage } from '../../models/SeatUsage.model';
import { AttentionItem, TenantDailyStat } from '../../models/Signals.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'signals' });
  await Promise.all([AttentionItem.init(), TenantDailyStat.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => {
  await Promise.all([Company, User, OrganizationEntitlement, SeatUsage, AttentionItem, TenantDailyStat].map((m: any) => m.deleteMany({})));
});

const now = new Date('2026-11-16T12:00:00Z');
const DAY = 86_400_000;
const company = (over: Record<string, unknown> = {}) =>
  Company.create({ name: 'Acme', slug: `acme-${new Types.ObjectId()}`, status: 'active', created_at: new Date(now.getTime() - 60 * DAY), last_activity_at: now, ...over });
const open = (kind: string) => AttentionItem.find({ kind, open: true }).lean();

test('pure rules: seats and sync lag', () => {
  assert.equal(seatSignal(8, 10), null);
  assert.equal(seatSignal(9, 10), 'seats_near_limit');
  assert.equal(seatSignal(10, 10), 'seats_near_limit');
  assert.equal(seatSignal(11, 10), 'seats_over_limit');
  assert.equal(seatSignal(50, null), null);
  assert.equal(syncLagging({ lag: 100, parked: 0 }), false);
  assert.equal(syncLagging({ lag: 101, parked: 0 }), true);
  assert.equal(syncLagging({ lag: 0, parked: 1 }), true);
});

test('trial rules: ending within 7 days is a warning, ended is critical, resolves when the trial moves', async () => {
  const c1 = await company({ trial_ends_at: new Date(now.getTime() + 3 * DAY) });
  const c2 = await company({ trial_ends_at: new Date(now.getTime() - 2 * DAY) });
  await company({ trial_ends_at: new Date(now.getTime() + 30 * DAY) });
  await runSignals(now);
  const ending = await open('trial_ending');
  const ended = await open('trial_ended');
  assert.deepEqual([ending.length, ending[0]?.severity, String(ending[0]?.company_id)], [1, 'warning', String(c1._id)]);
  assert.deepEqual([ended.length, ended[0]?.severity, String(ended[0]?.company_id)], [1, 'critical', String(c2._id)]);
  await Company.updateOne({ _id: c1._id }, { $set: { trial_ends_at: new Date(now.getTime() + 20 * DAY) } });
  await runSignals(new Date(now.getTime() + 5 * 60_000));
  assert.equal((await open('trial_ending')).length, 0);
  const resolved = await AttentionItem.findOne({ kind: 'trial_ending', company_id: c1._id }).lean();
  assert.ok(resolved?.resolved_at && resolved.open === false);
});

test('a second run keeps first_seen_at and moves last_seen_at, one open item per kind and tenant', async () => {
  const c = await company({ status: 'provisioning', created_at: new Date(now.getTime() - 3600_000) });
  await runSignals(now);
  const later = new Date(now.getTime() + 5 * 60_000);
  await runSignals(later);
  const items = await open('provisioning_failed');
  assert.equal(items.length, 1);
  assert.equal(String(items[0].company_id), String(c._id));
  assert.equal(items[0].first_seen_at.getTime(), now.getTime());
  assert.equal(items[0].last_seen_at.getTime(), later.getTime());
});

test('seats, inactive tenants and expiring overrides', async () => {
  const c = await company({ last_activity_at: new Date(now.getTime() - 20 * DAY) });
  await OrganizationEntitlement.create({ company_id: c._id, product_key: 'people', status: 'active', seats_limit: 10, source: 'operator', reason: 'x', expires_at: new Date(now.getTime() + 2 * DAY) });
  await SeatUsage.create({ company_id: c._id, product_key: 'people', used: 12, computed_at: now });
  await runSignals(now);
  assert.equal((await open('seats_over_limit')).length, 1);
  assert.equal((await open('seats_near_limit')).length, 0);
  assert.equal((await open('inactive_tenant')).length, 1);
  assert.equal((await open('override_expiring')).length, 1);
  await SeatUsage.updateOne({ company_id: c._id }, { $set: { used: 9 } });
  await runSignals(new Date(now.getTime() + 60_000));
  assert.equal((await open('seats_over_limit')).length, 0);
  assert.equal((await open('seats_near_limit')).length, 1);
});

test('a closed organization raises no attention items and its open ones resolve (regression: override_expiring stayed open)', async () => {
  const c = await company();
  await OrganizationEntitlement.create({ company_id: c._id, product_key: 'people', status: 'active', seats_limit: 10, source: 'operator', reason: 'x', expires_at: new Date(now.getTime() + 2 * DAY) });
  await SeatUsage.create({ company_id: c._id, product_key: 'people', used: 12, computed_at: now });
  await TenantDailyStat.create({ company_id: c._id, day: startOfDay(now), members_total: 1, members_active: 1, admins_without_mfa: 1, seats: {} });
  await runSignals(now);
  const kinds = ['override_expiring', 'seats_over_limit', 'admins_without_mfa'];
  for (const k of kinds) assert.equal((await open(k)).length, 1, k);
  await Company.updateOne({ _id: c._id }, { $set: { status: 'closed' } });
  await runSignals(new Date(now.getTime() + 60_000));
  for (const k of kinds) assert.equal((await open(k)).length, 0, `${k} resolves once the organization is closed`);
});

test('a tenant with no sign-in yet is inactive only once it is older than 14 days', async () => {
  await company({ last_activity_at: undefined, created_at: new Date(now.getTime() - 3 * DAY) });
  await company({ last_activity_at: undefined, created_at: new Date(now.getTime() - 30 * DAY) });
  await runSignals(now);
  assert.equal((await open('inactive_tenant')).length, 1);
});

test('daily stats: members, seats, admins without MFA; admins_without_mfa feeds the signal', async () => {
  const c = await company();
  await SeatUsage.create({ company_id: c._id, product_key: 'people', used: 4, computed_at: now });
  const mk = (i: number, lifecycle_state: string) => User.collection.insertOne({
    company_id: c._id, email: `u${i}@x.test`, full_name: `U${i}`, employee_id: `E${i}`, lifecycle_state, mfa_enabled: false, role: 'Employee', is_active: true,
  });
  await mk(1, 'active'); await mk(2, 'active'); await mk(3, 'invited'); await mk(4, 'archived');
  assert.equal(await computeDailyStats(now), 1);
  await computeDailyStats(now); // idempotent: still one row for the day
  const rows = await TenantDailyStat.find().lean();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].members_total, rows[0].members_active, rows[0].day.getTime()], [3, 2, startOfDay(now).getTime()]);
  assert.equal((rows[0].seats as any).get ? (rows[0].seats as any).get('people') : (rows[0].seats as any).people, 4);
  await TenantDailyStat.updateOne({ company_id: c._id }, { $set: { admins_without_mfa: 2 } });
  await runSignals(now);
  const items = await open('admins_without_mfa');
  assert.equal(items.length, 1);
  assert.match(items[0].summary, /2 admin/);
});
