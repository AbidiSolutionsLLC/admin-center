// server/src/platform/readApi.ts — Platform API read endpoints (05 §2): orgs list, events, members, departments, locations, session revocations
import { Router, Response } from 'express';
import { Types } from 'mongoose';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { Location } from '../models/Location.model';
import { Session } from '../models/Session.model';
import { PlatformEvent } from '../models/PlatformEvent.model';
import { OrgEventCounter } from '../models/OrgEventCounter.model';
import { PlatformEventSubscription } from '../models/PlatformEventSubscription.model';
import { SubscriptionCursor } from '../models/SubscriptionCursor.model';
import { requireServiceToken } from './requireServiceToken';
import { calendarsRouter } from './calendars';
import { roleCatalogRouter } from './roleCatalog';
import { manifestRouter } from './manifest';

export const platformReadRouter = Router();

const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const bad = (res: Response, msg: string) => res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });

/** Optional integer query param within [min,max]; def when absent, undefined when invalid. */
function intParam(v: unknown, def: number, min: number, max: number): number | undefined {
  if (v === undefined || v === '') return def;
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

/** Optional ISO date query param: undefined = absent, null = invalid. */
function dateParam(v: unknown): Date | undefined | null {
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const idStr = (v: unknown) => (v == null ? null : String(v));

platformReadRouter.get('/orgs', requireServiceToken('platform.org.read'), async (_req, res, next) => {
  try {
    const companies: any[] = await Company.find({}, { slug: 1, status: 1 }).sort({ _id: 1 }).lean();
    const counters = await OrgEventCounter.find({ _id: { $in: companies.map(c => c._id) } }).lean();
    const seqs = new Map(counters.map(c => [String(c._id), c.seq]));
    res.json({
      items: companies.map(c => ({ id: c._id, slug: c.slug, status: c.status ?? 'active', latest_seq: seqs.get(String(c._id)) ?? 0 })),
    });
  } catch (err) { next(err); }
});

platformReadRouter.get('/orgs/:orgId/events', requireServiceToken('platform.events.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const afterSeq = intParam(req.query.after_seq, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = intParam(req.query.limit, 100, 1, 500);
    if (afterSeq === undefined) return bad(res, 'after_seq must be a non-negative integer');
    if (limit === undefined) return bad(res, 'limit must be an integer between 1 and 500');
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);

    const org = new Types.ObjectId(orgId);
    const counter = await OrgEventCounter.findById(org).lean();
    const latestSeq = counter?.seq ?? 0;
    if (afterSeq > latestSeq) return res.status(409).json({ error: 'after_seq is ahead of the latest event', code: 'CURSOR_AHEAD', latest_seq: latestSeq });
    const rows = await PlatformEvent.find({ org_id: org, seq: { $gt: afterSeq } }).sort({ seq: 1 }).limit(limit + 1).lean();

    // The event right after the cursor is missing although the counter says it exists: purged by TTL.
    if (afterSeq > 0 && afterSeq < latestSeq && (rows.length === 0 || rows[0].seq !== afterSeq + 1)) {
      return res.status(410).json({ error: 'Cursor expired', code: 'CURSOR_EXPIRED' });
    }
    const page = rows.slice(0, limit);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      events: page.map(e => ({
        id: e.id, type: e.type, version: e.version, occurred_at: e.occurred_at, org_id: e.org_id,
        seq: e.seq, subject: e.subject, actor: e.actor, correlation_id: e.correlation_id, data: e.data,
      })),
      latest_seq: latestSeq,
      has_more: rows.length > limit,
    });
    // Informational ack (06 section 3): the subscriber asking for after_seq has processed up to it. Never fails the request.
    try {
      const clientId = req.service?.client_id;
      const sub = clientId ? await PlatformEventSubscription.findOne({ name: clientId }).select('_id').lean() : null;
      if (sub && afterSeq > 0) {
        await SubscriptionCursor.updateOne({ subscription_id: sub._id, org_id: org }, { $max: { last_acknowledged_seq: Math.min(afterSeq, latestSeq) } }, { upsert: true });
      }
    } catch { /* informational only */ }
  } catch (err) { next(err); }
});

const MEMBER_FIELDS = '_id email full_name department_id location_id custom_fields employment_type manager_id lifecycle_state authz_ver updated_at employee_id hire_date termination_date phone avatar_url identity_id';
const isoOrNull = (d: unknown): string | null => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
const memberView = (u: any) => ({
  id: u._id,
  email: u.email,
  full_name: u.full_name,
  department_id: idStr(u.department_id),
  location_id: idStr(u.location_id),
  job_title: u.custom_fields?.job_title ?? null, // User has no dedicated job_title field
  employment_type: u.employment_type,
  manager_id: idStr(u.manager_id),
  reports_to: idStr(u.manager_id),
  lifecycle_state: u.lifecycle_state,
  employee_id: u.employee_id ?? null,
  hire_date: isoOrNull(u.hire_date),
  termination_date: isoOrNull(u.termination_date),
  phone: u.phone ?? null,
  avatar_url: u.avatar_url ?? null,
  identity_id: idStr(u.identity_id),
  authz_ver: u.authz_ver ?? 1,
  updated_at: u.updated_at,
});

platformReadRouter.get('/orgs/:orgId/members', requireServiceToken('platform.members.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const limit = intParam(req.query.limit, 100, 1, 500);
    if (limit === undefined) return bad(res, 'limit must be an integer between 1 and 500');
    const since = dateParam(req.query.updated_since);
    if (since === null) return bad(res, 'updated_since must be an ISO date');
    const cursor = req.query.cursor;
    if (cursor !== undefined && cursor !== '' && (typeof cursor !== 'string' || !Types.ObjectId.isValid(cursor))) return bad(res, 'invalid cursor');
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);

    const filter: Record<string, unknown> = { company_id: orgId };
    if (since) filter.updated_at = { $gte: since };
    if (cursor) filter._id = { $gt: cursor };
    const rows = await User.find(filter).select(MEMBER_FIELDS).sort({ _id: 1 }).limit(limit + 1).lean();
    const page = rows.slice(0, limit);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      items: page.map(memberView),
      next_cursor: rows.length > limit ? String(page[page.length - 1]._id) : null,
    });
  } catch (err) { next(err); }
});

platformReadRouter.get('/orgs/:orgId/members/:memberId', requireServiceToken('platform.members.read'), async (req, res, next) => {
  try {
    const { orgId, memberId } = req.params as Record<string, string>;
    if (!Types.ObjectId.isValid(orgId) || !Types.ObjectId.isValid(memberId)) return notFound(res);
    const u = await User.findOne({ _id: memberId, company_id: orgId }).select(MEMBER_FIELDS).lean();
    if (!u) return notFound(res);
    res.setHeader('Cache-Control', 'no-store');
    res.json(memberView(u));
  } catch (err) { next(err); }
});

platformReadRouter.get('/orgs/:orgId/departments', requireServiceToken('platform.org.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const since = dateParam(req.query.updated_since);
    if (since === null) return bad(res, 'updated_since must be an ISO date');
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);
    const filter: Record<string, unknown> = { company_id: orgId };
    if (since) filter.updated_at = { $gte: since };
    const rows: any[] = await Department.find(filter).sort({ _id: 1 }).lean();
    res.json(rows.map(d => ({
      id: d._id, name: d.name, type: d.type, parent_id: idStr(d.parent_id),
      primary_manager_id: idStr(d.primary_manager_id), is_active: d.is_active,
    })));
  } catch (err) { next(err); }
});

platformReadRouter.get('/orgs/:orgId/locations', requireServiceToken('platform.org.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const since = dateParam(req.query.updated_since);
    if (since === null) return bad(res, 'updated_since must be an ISO date');
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);
    const filter: Record<string, unknown> = { company_id: orgId, is_deleted: { $ne: true } };
    if (since) filter.updated_at = { $gte: since };
    const rows: any[] = await Location.find(filter).sort({ _id: 1 }).lean();
    res.json(rows.map(l => ({ id: l._id, name: l.name, parent_id: idStr(l.parent_id), timezone: l.timezone })));
  } catch (err) { next(err); }
});

platformReadRouter.get('/sessions/revocations', requireServiceToken('platform.sessions.read'), async (req, res, next) => {
  try {
    const since = dateParam(req.query.since);
    if (since === null) return bad(res, 'since must be an ISO date');
    const limit = intParam(req.query.limit, 1000, 1, 1000);
    if (limit === undefined) return bad(res, 'limit must be an integer between 1 and 1000');
    const afterSid = req.query.after_sid;
    if (afterSid !== undefined && typeof afterSid !== 'string') return bad(res, 'invalid after_sid');
    const realm = req.query.realm;
    if (realm !== undefined && realm !== 'tenant' && realm !== 'operator') return bad(res, 'realm must be tenant or operator');
    let filter: Record<string, unknown> = { revoked_at: since ? { $gte: since } : { $exists: true, $ne: null } };
    // Keyset continuation within identical revoked_at values (pass since=X-Next-Since, after_sid=X-Next-After-Sid).
    if (since && afterSid) {
      filter = { $or: [{ revoked_at: { $gt: since } }, { revoked_at: since, _id: { $gt: afterSid } }] };
    }
    if (realm) filter = { $and: [filter, { realm }] }; // default (absent) = all realms, for compatibility
    const found = await Session.find(filter).sort({ revoked_at: 1, _id: 1 }).limit(limit + 1).lean();
    const rows = found.slice(0, limit);
    res.setHeader('Cache-Control', 'no-store');
    if (found.length > limit) {
      const last: any = rows[rows.length - 1];
      res.setHeader('X-Has-More', 'true');
      res.setHeader('X-Next-Since', new Date(last.revoked_at).toISOString());
      res.setHeader('X-Next-After-Sid', String(last._id));
    }
    res.json(rows.map(s => ({ sid: s._id, member_id: s.member_id, org_id: s.company_id, revoked_at: s.revoked_at })));
  } catch (err) { next(err); }
});

platformReadRouter.use(calendarsRouter);
platformReadRouter.use(roleCatalogRouter);
platformReadRouter.use(manifestRouter);
