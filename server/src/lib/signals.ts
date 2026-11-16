// server/src/lib/signals.ts
// Command Center signals (DRD 4.4, Plan 4.10). Two jobs under leases:
//   - every 5 minutes: each rule is one indexed query that returns the tenants it matches; `AttentionItem` rows are
//     upserted for them (`last_seen_at`) and rows that no longer match get `resolved_at`. No rule loops over members.
//   - every 6 hours: `TenantDailyStat` for today (members, sign-ins, seats, org admins without MFA), written by upsert.
// A rule that throws leaves its own items as they were; the other rules still run.
import { Types } from 'mongoose';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { Invitation } from '../models/Invitation.model';
import { EmailDelivery } from '../models/EmailDelivery.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { SeatUsage } from '../models/SeatUsage.model';
import { SecurityEvent } from '../models/SecurityEvent.model';
import { AttentionItem, TenantDailyStat, type AttentionSeverity } from '../models/Signals.model';
import { ACCESS_STATES } from '../identity/config';
import { ROLES } from '../constants/roles';
import { every } from './periodic';
import { probeProducts } from './health/productsProbe';

export const SIGNALS_EVERY_MS = 5 * 60_000;
export const STATS_EVERY_MS = 6 * 3600_000;
const DAY = 24 * 3600_000;
export const SYNC_LAG_LIMIT = 100;
export const SYNC_LAG_MIN_AGE_MS = 10 * 60_000;
export const PROVISIONING_STUCK_MS = 15 * 60_000;
export const SEATS_NEAR = 0.9;

export const SIGNAL_KINDS = [
  'provisioning_failed', 'invite_undelivered', 'invite_expired', 'trial_ending', 'trial_ended', 'seats_near_limit', 'seats_over_limit',
  'sync_lag', 'override_expiring', 'inactive_tenant', 'admins_without_mfa',
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export interface Desired { kind: SignalKind; severity: AttentionSeverity; company_id: Types.ObjectId; summary: string; link: string }

const link = (id: Types.ObjectId | string, tab?: string) => `/operator/organizations/${id}${tab ? `?tab=${tab}` : ''}`;
const days = (ms: number) => Math.max(0, Math.ceil(ms / DAY));
const names = async (ids: Array<Types.ObjectId | string>) => new Map((await Company.find({ _id: { $in: ids } }).select('name').lean()).map((c) => [String(c._id), c.name]));
const label = (n: Map<string, string>, id: Types.ObjectId | string) => n.get(String(id)) ?? 'An organization';

/** Pure: seat counts against limits. Returns the kind for one product, or null. */
export function seatSignal(used: number, limit: number | null | undefined): 'seats_over_limit' | 'seats_near_limit' | null {
  if (!limit || limit <= 0) return null;
  if (used > limit) return 'seats_over_limit';
  return used >= SEATS_NEAR * limit ? 'seats_near_limit' : null;
}

/** Pure: the sync_lag condition for one organization row from the products health route. */
export const syncLagging = (row: { lag: number; parked: number }) => row.lag > SYNC_LAG_LIMIT || row.parked > 0;

export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ── Rules ────────────────────────────────────────────────────────────────────────────────────

async function provisioningFailed(now: Date): Promise<Desired[]> {
  // The code has no 'provisioning_failed' status (a failed provisioning rolls back). A tenant that stays in
  // 'provisioning' past the limit is the nearest stuck state.
  const rows = await Company.find({ status: 'provisioning', created_at: { $lt: new Date(now.getTime() - PROVISIONING_STUCK_MS) } }).select('name').lean();
  return rows.map((c) => ({ kind: 'provisioning_failed', severity: 'critical', company_id: c._id as Types.ObjectId, summary: `${c.name} is stuck in provisioning`, link: link(c._id, 'onboarding') }));
}

async function invitationRules(now: Date): Promise<Desired[]> {
  const invs = await Invitation.find({ kind: 'first_admin', state: 'pending', company_id: { $ne: null } }).select('company_id user_id expires_at createdAt').lean();
  if (invs.length === 0) return [];
  const n = await names(invs.map((i) => i.company_id as Types.ObjectId));
  const out: Desired[] = [];
  const live = invs.filter((i) => i.expires_at.getTime() > now.getTime());
  if (live.length) {
    const mins = new Date(Math.min(...live.map((i) => i.createdAt.getTime())));
    const rows = await EmailDelivery.find({ 'related.type': 'user', 'related.id': { $in: live.map((i) => String(i.user_id)) }, created_at: { $gte: mins } })
      .sort({ created_at: -1 }).select('related status created_at').lean();
    const latest = new Map<string, { status: string; created_at: Date }>();
    for (const r of rows) if (r.related && !latest.has(r.related.id)) latest.set(r.related.id, r);
    for (const i of live) {
      const d = latest.get(String(i.user_id));
      if (d && d.status === 'failed' && d.created_at.getTime() >= i.createdAt.getTime()) {
        out.push({ kind: 'invite_undelivered', severity: 'critical', company_id: i.company_id as Types.ObjectId, summary: `${label(n, i.company_id!)}: the first admin's invitation e-mail could not be delivered`, link: link(i.company_id!, 'onboarding') });
      }
    }
  }
  const expired = invs.filter((i) => i.expires_at.getTime() <= now.getTime());
  if (expired.length) {
    const invited = new Set((await User.find({ _id: { $in: expired.map((i) => i.user_id) }, lifecycle_state: 'invited' }).select('_id').lean()).map((u) => String(u._id)));
    for (const i of expired) {
      if (invited.has(String(i.user_id))) out.push({ kind: 'invite_expired', severity: 'warning', company_id: i.company_id as Types.ObjectId, summary: `${label(n, i.company_id!)}: the first admin's invitation expired`, link: link(i.company_id!, 'onboarding') });
    }
  }
  return out;
}

async function trials(now: Date): Promise<Desired[]> {
  const rows = await Company.find({ status: 'active', trial_ends_at: { $lte: new Date(now.getTime() + 7 * DAY) } }).select('name trial_ends_at').lean();
  return rows.map((c): Desired => {
    const left = c.trial_ends_at!.getTime() - now.getTime();
    return left < 0
      ? { kind: 'trial_ended', severity: 'critical', company_id: c._id as Types.ObjectId, summary: `${c.name}: the trial ended ${days(-left)} day(s) ago`, link: link(c._id) }
      : { kind: 'trial_ending', severity: 'warning', company_id: c._id as Types.ObjectId, summary: `${c.name}: the trial ends in ${days(left)} day(s)`, link: link(c._id) };
  });
}

async function seats(): Promise<Desired[]> {
  const ents = await OrganizationEntitlement.find({ status: 'active', seats_limit: { $gt: 0 } }).select('company_id product_key seats_limit').lean();
  if (ents.length === 0) return [];
  const usage = await SeatUsage.find({ company_id: { $in: ents.map((e) => e.company_id) } }).select('company_id product_key used').lean();
  const used = new Map(usage.map((u) => [`${u.company_id}:${u.product_key}`, u.used]));
  const n = await names(ents.map((e) => e.company_id));
  const worst = new Map<string, Desired>(); // one item per tenant and kind
  for (const e of ents) {
    const u = used.get(`${e.company_id}:${e.product_key}`) ?? 0;
    const kind = seatSignal(u, e.seats_limit);
    if (!kind) continue;
    const key = `${kind}:${e.company_id}`;
    if (worst.has(key)) continue;
    worst.set(key, {
      kind, severity: kind === 'seats_over_limit' ? 'critical' : 'warning', company_id: e.company_id as Types.ObjectId,
      summary: `${label(n, e.company_id)}: ${e.product_key} uses ${u} of ${e.seats_limit} seats`, link: link(e.company_id, 'products'),
    });
  }
  return [...worst.values()];
}

async function syncLag(): Promise<Desired[]> {
  const p = await probeProducts();
  if (!p || !p.answered) throw new Error('products backend did not answer'); // leave existing sync_lag items alone
  const rows = p.orgs.filter((o) => Types.ObjectId.isValid(o.platformOrgId) && syncLagging(o));
  const n = await names(rows.map((o) => o.platformOrgId));
  return rows.map((o) => ({
    kind: 'sync_lag', severity: 'warning', company_id: new Types.ObjectId(o.platformOrgId),
    summary: `${label(n, o.platformOrgId)}: products sync is ${o.lag} behind${o.parked ? `, ${o.parked} parked` : ''}`, link: link(o.platformOrgId, 'products'),
  }));
}

async function overrides(now: Date): Promise<Desired[]> {
  const rows = await OrganizationEntitlement.find({ source: 'operator', expires_at: { $gt: now, $lte: new Date(now.getTime() + 7 * DAY) } }).select('company_id product_key expires_at').lean();
  const n = await names(rows.map((r) => r.company_id));
  const one = new Map<string, Desired>();
  for (const r of rows) {
    if (one.has(String(r.company_id))) continue;
    one.set(String(r.company_id), { kind: 'override_expiring', severity: 'info', company_id: r.company_id as Types.ObjectId, summary: `${label(n, r.company_id)}: the ${r.product_key} override expires in ${days(r.expires_at!.getTime() - now.getTime())} day(s)`, link: link(r.company_id, 'products') });
  }
  return [...one.values()];
}

async function inactive(now: Date): Promise<Desired[]> {
  const t = new Date(now.getTime() - 14 * DAY);
  const rows = await Company.find({ status: 'active', $or: [{ last_activity_at: { $lt: t } }, { last_activity_at: { $exists: false }, created_at: { $lt: t } }] }).select('name').lean();
  return rows.map((c) => ({ kind: 'inactive_tenant', severity: 'info', company_id: c._id as Types.ObjectId, summary: `${c.name}: no sign-in for 14 days`, link: link(c._id) }));
}

async function noMfa(now: Date): Promise<Desired[]> {
  const stats = await TenantDailyStat.find({ day: { $gte: new Date(startOfDay(now).getTime() - DAY) }, admins_without_mfa: { $gt: 0 } }).sort({ day: -1 }).select('company_id admins_without_mfa').lean();
  const seen = new Map<string, number>();
  for (const s of stats) if (!seen.has(String(s.company_id))) seen.set(String(s.company_id), s.admins_without_mfa);
  const ids = [...seen.keys()].map((id) => new Types.ObjectId(id));
  const n = await names(ids);
  return ids.map((id) => ({ kind: 'admins_without_mfa', severity: 'warning', company_id: id, summary: `${label(n, id)}: ${seen.get(String(id))} admin(s) without MFA`, link: link(id, 'admins') }));
}

const RULES: Array<{ kinds: SignalKind[]; run: (now: Date) => Promise<Desired[]> }> = [
  { kinds: ['provisioning_failed'], run: provisioningFailed },
  { kinds: ['invite_undelivered', 'invite_expired'], run: invitationRules },
  { kinds: ['trial_ending', 'trial_ended'], run: trials },
  { kinds: ['seats_near_limit', 'seats_over_limit'], run: seats },
  { kinds: ['sync_lag'], run: syncLag },
  { kinds: ['override_expiring'], run: overrides },
  { kinds: ['inactive_tenant'], run: inactive },
  { kinds: ['admins_without_mfa'], run: noMfa },
];

/** Upsert what matches, resolve what no longer does, for the kinds one rule owns. */
async function reconcile(kinds: SignalKind[], desired: Desired[], now: Date): Promise<void> {
  const keep: Array<{ kind: string; company_id: Types.ObjectId }> = [];
  for (const d of desired) {
    keep.push({ kind: d.kind, company_id: d.company_id });
    // sync_lag only counts once the condition has held for SYNC_LAG_MIN_AGE_MS.
    const prior = d.kind === 'sync_lag' ? await AttentionItem.findOne({ kind: d.kind, company_id: d.company_id, open: true }).select('first_seen_at').lean() : null;
    const confirmed = d.kind !== 'sync_lag' || (!!prior && now.getTime() - prior.first_seen_at.getTime() >= SYNC_LAG_MIN_AGE_MS);
    await AttentionItem.updateOne(
      { kind: d.kind, company_id: d.company_id, open: true },
      { $set: { severity: d.severity, summary: d.summary, link: d.link, last_seen_at: now, confirmed }, $setOnInsert: { first_seen_at: now, open: true }, $unset: { resolved_at: 1 } },
      { upsert: true },
    );
  }
  const stale = { kind: { $in: kinds }, open: true, ...(keep.length ? { $nor: keep } : {}) };
  await AttentionItem.updateMany(stale, { $set: { open: false, resolved_at: now } });
}

/** One pass over every rule. Returns the kinds whose rule failed (their items were left untouched). */
export async function runSignals(now: Date = new Date()): Promise<{ failed: SignalKind[] }> {
  const failed: SignalKind[] = [];
  for (const rule of RULES) {
    try {
      await reconcile(rule.kinds, await rule.run(now), now);
    } catch (err) {
      failed.push(...rule.kinds);
      console.error(`[signals:${rule.kinds[0]}]`, String((err as Error)?.message ?? err));
    }
  }
  return { failed };
}

// ── Daily stats ──────────────────────────────────────────────────────────────────────────────

/** Today's `TenantDailyStat` for every tenant: grouped queries, never a loop over members. Returns the tenant count. */
export async function computeDailyStats(now: Date = new Date()): Promise<number> {
  const day = startOfDay(now);
  const states = [...ACCESS_STATES];
  const [members, signIns, seatRows, adminRole] = await Promise.all([
    User.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
      { $match: { lifecycle_state: { $ne: 'archived' } } },
      { $group: { _id: '$company_id', total: { $sum: 1 }, active: { $sum: { $cond: [{ $in: ['$lifecycle_state', states] }, 1, 0] } } } },
    ]),
    SecurityEvent.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { event_type: 'login_success', created_at: { $gte: day }, company_id: { $exists: true } } },
      { $group: { _id: '$company_id', n: { $sum: 1 } } },
    ]),
    SeatUsage.find().select('company_id product_key used').lean(),
    Role.find({ name: ROLES.SUPER_ADMIN }).select('_id').lean(),
  ]);
  const links = adminRole.length ? await UserRole.find({ role_id: { $in: adminRole.map((r) => r._id) } }).select('user_id').lean() : [];
  const noMfa = links.length
    ? await User.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { _id: { $in: links.map((l) => l.user_id) }, lifecycle_state: { $in: states }, mfa_enabled: { $ne: true } } },
      { $group: { _id: '$company_id', n: { $sum: 1 } } },
    ])
    : [];

  const seatMap = new Map<string, Record<string, number>>();
  for (const s of seatRows) seatMap.set(String(s.company_id), { ...(seatMap.get(String(s.company_id)) ?? {}), [s.product_key]: s.used });
  const sign = new Map(signIns.map((r) => [String(r._id), r.n]));
  const mfa = new Map(noMfa.map((r) => [String(r._id), r.n]));

  if (members.length === 0) return 0;
  await TenantDailyStat.bulkWrite(members.map((m) => ({
    updateOne: {
      filter: { company_id: m._id, day },
      update: { $set: { members_total: m.total, members_active: m.active, external_total: 0, sign_ins: sign.get(String(m._id)) ?? 0, seats: seatMap.get(String(m._id)) ?? {}, admins_without_mfa: mfa.get(String(m._id)) ?? 0 } },
      upsert: true,
    },
  })));
  return members.length;
}

let stops: Array<() => void> = [];

export function startSignalJobs(): void {
  if (stops.length) return;
  stops = [
    every('signals', SIGNALS_EVERY_MS, async () => { await runSignals(); }),
    every('tenant-daily-stats', STATS_EVERY_MS, async () => { await computeDailyStats(); }),
  ];
}

export function stopSignalJobs(): void {
  stops.forEach((s) => s());
  stops = [];
}
