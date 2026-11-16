// server/src/platform/rateLimit.ts — M4: Platform API rate limits keyed on the authenticated service client, not the source IP.
// The products backend is a single IP (and may be several instances behind one NAT), so the global per-IP limiter does not fit.
// Counters live in MongoDB (middleware/mongoRateLimitStore.ts) so several Admin instances share one budget.
import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { MongoRateLimitStore } from '../middleware/mongoRateLimitStore';

const DEFAULT_PER_MIN = 1200;

/** PLATFORM_RATE_LIMIT_PER_MIN (default 1200), read per request so it can be tuned without rebuilding the limiter. */
export const platformRateLimitPerMin = (): number => {
  const n = Number(process.env.PLATFORM_RATE_LIMIT_PER_MIN);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_PER_MIN;
};

/** Per-client budget. Must run after service-token authentication (needs req.service). */
export const platformRateLimiter = rateLimit({
  store: new MongoRateLimitStore('platform'),
  windowMs: 60_000,
  limit: () => platformRateLimitPerMin(),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => `client:${req.service?.client_id ?? 'unauthenticated'}`,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
  },
});

/**
 * Keeps unauthenticated traffic throttled now that /platform/v1 skips the global per-IP limiter: only 401 responses
 * (failed token verification) count, per IP, so a legitimate client's successful calls never consume this budget.
 */
export const platformAuthFailureLimiter = rateLimit({
  store: new MongoRateLimitStore('platform-auth-failure'),
  windowMs: 15 * 60_000,
  limit: 300,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode !== 401,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
  },
});
