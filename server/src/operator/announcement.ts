// server/src/operator/announcement.ts
// Platform announcement (Plan 4.12, DRD 4.2/4.3, PRD CC-AN-1).
//   GET    /announcement   the current one or null            (tenants.read)
//   PUT    /announcement   replace it: { message, severity, starts_at?, ends_at }   (announcements.write)
//   DELETE /announcement   end it now                           (announcements.write)
// Tenants read it through `GET /api/announcement` (routes/announcement.routes.ts), which uses `currentAnnouncement`.
import { Router, Request, Response } from 'express';
import { ClientSession } from 'mongoose';
import { z } from 'zod';
import { Announcement, ANNOUNCEMENT_SEVERITIES } from '../models/Announcement.model';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { requirePermission } from './permissions';
import type { AuditInput } from './audit';

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  audit: (req: Request, p: AuditInput, session?: ClientSession) => Promise<void>;
}

const out = (a: { _id: unknown; message: string; severity: string; starts_at: Date; ends_at: Date }) =>
  ({ id: String(a._id), message: a.message, severity: a.severity, starts_at: a.starts_at, ends_at: a.ends_at });

/** The announcement whose window contains `now` (the latest started wins), or null. */
export async function currentAnnouncement(now: Date = new Date()) {
  const a = await Announcement.findOne({ starts_at: { $lte: now }, ends_at: { $gt: now } }).sort({ starts_at: -1 }).lean();
  return a ? out(a) : null;
}

const Body = z.object({
  message: z.string().trim().min(1).max(280),
  severity: z.enum(ANNOUNCEMENT_SEVERITIES).default('info'),
  starts_at: z.coerce.date().optional(),
  ends_at: z.coerce.date(),
});

export function announcementRoutes(h: Helpers): Router {
  const router = Router();

  router.get('/announcement', requirePermission('tenants.read'), asyncHandler(async (_req: Request, res: Response) => {
    h.ok(res, await currentAnnouncement());
  }));

  router.put('/announcement', requirePermission('announcements.write'), asyncHandler(async (req: Request, res: Response) => {
    const b = Body.parse(req.body);
    const now = new Date();
    const starts = b.starts_at ?? now;
    if (b.ends_at <= starts) throw new AppError('ends_at must be after starts_at', 400, 'VALIDATION_ERROR');
    if (b.ends_at <= now) throw new AppError('ends_at must be in the future', 400, 'VALIDATION_ERROR');
    // Only one announcement at a time: whatever is current or scheduled ends now (or never starts).
    const before = await currentAnnouncement(now);
    await Announcement.updateMany({ ends_at: { $gt: now }, starts_at: { $lte: now } }, { $set: { ends_at: now } });
    await Announcement.deleteMany({ starts_at: { $gt: now } });
    const created = await Announcement.create({ message: b.message, severity: b.severity, starts_at: starts, ends_at: b.ends_at, created_by: req.operator!._id });
    await h.audit(req, {
      action: 'announcement.set', target_type: 'Announcement', target_id: String(created._id), category: 'system',
      before: before ? { message: before.message, severity: before.severity } : undefined, after: { message: b.message, severity: b.severity, ends_at: b.ends_at },
    });
    h.ok(res, out(created));
  }));

  router.delete('/announcement', requirePermission('announcements.write'), asyncHandler(async (req: Request, res: Response) => {
    const now = new Date();
    const cur = await currentAnnouncement(now);
    await Announcement.updateMany({ ends_at: { $gt: now } }, { $set: { ends_at: now } });
    if (cur) await h.audit(req, { action: 'announcement.ended', target_type: 'Announcement', target_id: cur.id, category: 'system', before: { message: cur.message } });
    h.ok(res, { ended: !!cur });
  }));

  return router;
}
