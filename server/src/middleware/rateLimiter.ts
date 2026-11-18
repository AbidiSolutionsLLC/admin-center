import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { MongoRateLimitStore } from './mongoRateLimitStore';

// Global rate limiter for all API routes
export const globalLimiter = rateLimit({
  store: new MongoRateLimitStore('global'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.GLOBAL_RATE_LIMIT) || (process.env.NODE_ENV === 'development' ? 10000 : 6000), // WI-07: prod default sized for dashboard polling (~0.8 req/s per open tab)
  standardHeaders: true, 
  legacyHeaders: false,
  // WI-07: only CORS preflight is skipped. M4: /platform/v1 has its own per-client limiter (platform/rateLimit.ts).
  skip: (req) => req.method === 'OPTIONS' || req.path === '/platform/v1' || req.path.startsWith('/platform/v1/'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

// Stricter rate limiter for authentication routes
export const authLimiter = rateLimit({
  store: new MongoRateLimitStore('auth'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.AUTH_RATE_LIMIT) || (process.env.NODE_ENV === 'development' ? 100 : 20), // increased for dev
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS', // WI-07: re-enabled; only CORS preflight is skipped
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
});

// Public invitation check (POST /people/verify-invite, 7.2 finding 1): 30 requests per 15 minutes per IP. Over the
// limit the answer is 429 with the standard error envelope; the outcomes of real and unknown tokens stay hidden behind it.
export const verifyInviteLimiter = rateLimit({
  store: new MongoRateLimitStore('invite-verify'),
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  handler: (_req, res) => {
    res.status(429).json({ success: false, error: 'Too many requests. Try again in 15 minutes.', code: 'RATE_LIMITED' });
  },
});

// Self-service invitation renewal (Plan 2.2): 3 requests per invitation per day. The key is the hash of the submitted
// token, so the count follows the link, not the caller. Over the limit the answer is still 202, so the response never
// reveals whether a token exists or how often it was used (DRD §5.2).
export const inviteRenewLimiter = rateLimit({
  store: new MongoRateLimitStore('invite-renew'),
  windowMs: 24 * 60 * 60 * 1000,
  limit: 3,
  standardHeaders: false,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    return token ? `inv:${crypto.createHash('sha256').update(token).digest('hex')}` : 'inv:none';
  },
  handler: (_req, res) => {
    res.status(202).json({ success: true });
  },
});
