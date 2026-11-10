// server/src/platform/calendars.ts — GET /orgs/:orgId/calendars/effective (05 §2)
import { Router } from 'express';
import { Types } from 'mongoose';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Location } from '../models/Location.model';
import { Holiday } from '../models/Holiday.model';
import { HolidayAssignment } from '../models/HolidayAssignment.model';
import { HolidayCalendar } from '../models/HolidayCalendar.model';
import { WorkSchedule } from '../models/WorkSchedule.model';
import { WorkScheduleAssignment } from '../models/WorkScheduleAssignment.model';
import { requireServiceToken } from './requireServiceToken';

export const calendarsRouter = Router();

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 366;
const bad = (res: any, msg: string) => res.status(400).json({ error: msg, code: 'VALIDATION_ERROR' });
const notFound = (res: any) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function parseDay(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const d = new Date(v.slice(0, 10) + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

/** Occurrence dates (UTC days) of a holiday within [from, to]. */
function occurrences(h: any, from: Date, to: Date): Date[] {
  const baseDay = new Date(ymd(new Date(h.date)) + 'T00:00:00Z');
  const end = h.recurring_details?.end_date ? new Date(h.recurring_details.end_date) : null;
  const out: Date[] = [];
  const ok = (d: Date) => d >= from && d <= to && d >= baseDay && (!end || d <= end);
  const day = baseDay.getUTCDate();
  const month = baseDay.getUTCMonth();
  if (h.recurring_type === 'custom') {
    if (ok(baseDay)) out.push(baseDay);
    return out;
  }
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
    if (h.recurring_type === 'yearly') {
      const d = new Date(Date.UTC(y, month, day));
      if (d.getUTCMonth() === month && ok(d)) out.push(d);
    } else {
      const step = h.recurring_type === 'monthly' ? 1 : 3;
      for (let m = 0; m < 12; m++) {
        if ((((m - month) % step) + step) % step !== 0) continue;
        const d = new Date(Date.UTC(y, m, day));
        if (d.getUTCMonth() === m && ok(d)) out.push(d);
      }
    }
  }
  return out;
}

calendarsRouter.get('/orgs/:orgId/calendars/effective', requireServiceToken('platform.org.read'), async (req, res, next) => {
  try {
    const orgId = req.params.orgId as string;
    if (!Types.ObjectId.isValid(orgId)) return notFound(res);
    const { member_id, location_id } = req.query;
    if (member_id !== undefined && (typeof member_id !== 'string' || !Types.ObjectId.isValid(member_id))) return notFound(res);
    if (location_id !== undefined && (typeof location_id !== 'string' || !Types.ObjectId.isValid(location_id))) return notFound(res);
    if (!member_id && !location_id) return bad(res, 'member_id or location_id is required');
    const from = parseDay(req.query.from);
    const to = parseDay(req.query.to);
    if (!from || !to) return bad(res, 'from and to are required dates (YYYY-MM-DD)');
    if (to < from) return bad(res, 'to must not be before from');
    if ((to.getTime() - from.getTime()) / DAY_MS + 1 > MAX_RANGE_DAYS) return bad(res, `range must not exceed ${MAX_RANGE_DAYS} days`);
    if (!(await Company.exists({ _id: orgId }))) return notFound(res);

    let locId: any = location_id;
    if (member_id) {
      const u: any = await User.findOne({ _id: member_id, company_id: orgId }).select('location_id').lean();
      if (!u) return notFound(res);
      if (!locId) locId = u.location_id;
    }
    if (locId && !(await Location.exists({ _id: locId, company_id: orgId, is_deleted: { $ne: true } }))) {
      if (location_id) return notFound(res);
      locId = null;
    }
    if (!locId) { // same fallback as locationSettingsService.getEffectiveSettingsForUser
      const company: any = await Company.findById(orgId).select('settings.default_location_id').lean();
      locId = company?.settings?.default_location_id ?? null;
    }

    res.setHeader('Cache-Control', 'no-store');
    if (!locId) return res.json({ holidays: [], work_schedule: null });

    const inRange = {
      company_id: orgId, location_id: locId,
      effective_date: { $lte: new Date(to.getTime() + DAY_MS - 1) },
      $or: [{ expiry_date: { $exists: false } }, { expiry_date: null }, { expiry_date: { $gte: from } }],
    };
    const hAssigns: any[] = await HolidayAssignment.find(inRange).lean();
    const cals: any[] = await HolidayCalendar.find({ _id: { $in: hAssigns.map(a => a.calendar_id) }, company_id: orgId, is_active: true }).select('name').lean();
    const calName = new Map(cals.map(c => [String(c._id), c.name]));
    const holidays: any[] = await Holiday.find({ calendar_id: { $in: cals.map(c => c._id) } }).lean();

    const items: any[] = [];
    for (const h of holidays) {
      for (const d of occurrences(h, from, to)) {
        items.push({
          date: ymd(d), name: h.name, calendar_id: String(h.calendar_id), calendar_name: calName.get(String(h.calendar_id)),
          holiday_code: h.holiday_code ?? null, recurring_type: h.recurring_type,
        });
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

    const wsAssign: any = await WorkScheduleAssignment.findOne(inRange).sort({ is_primary: -1, created_at: -1 }).lean();
    const ws: any = wsAssign ? await WorkSchedule.findOne({ _id: wsAssign.work_schedule_id, company_id: orgId, is_active: true }).lean() : null;

    res.json({
      holidays: items,
      work_schedule: ws ? {
        id: String(ws._id), name: ws.name, timezone: ws.timezone, working_days: ws.working_days,
        working_hours: ws.working_hours, break_hours: ws.break_hours?.start ? ws.break_hours : null,
      } : null,
    });
  } catch (err) { next(err); }
});
