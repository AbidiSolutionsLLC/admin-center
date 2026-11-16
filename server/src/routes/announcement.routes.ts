// Plan 4.12, DRD 4.3: the platform announcement for the tenant app. Any signed-in member may read it.
// Cached 60 seconds in this process, so a change reaches every tenant within a minute.
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { currentAnnouncement } from '../operator/announcement';
import { asyncHandler } from '../utils/asyncHandler';

export const ANNOUNCEMENT_CACHE_MS = 60_000;
let cache: { at: number; value: Awaited<ReturnType<typeof currentAnnouncement>> } | undefined;
export const resetAnnouncementCache = () => { cache = undefined; };

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  if (!cache || Date.now() - cache.at >= ANNOUNCEMENT_CACHE_MS) cache = { at: Date.now(), value: await currentAnnouncement() };
  res.json({ success: true, data: cache.value ? { message: cache.value.message, severity: cache.value.severity, ends_at: cache.value.ends_at } : null });
}));

export default router;
