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
