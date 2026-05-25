import rateLimit from 'express-rate-limit';

// Global rate limiter for all API routes
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 1000, // much higher in dev
  standardHeaders: true, 
  legacyHeaders: false,
  skip: () => true, // Disabled for now: req.method === 'OPTIONS', // Always skip preflight requests
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
});

// Stricter rate limiter for authentication routes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 20, // increased for dev
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => true, // Disabled for now: req.method === 'OPTIONS', // Always skip preflight requests
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
});
