import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokenService';
import { asyncHandler } from '../utils/asyncHandler';
import { User } from '../models';

export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
  }

  const user = await User.findById(decoded.userId).select('lifecycle_state is_active');
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });
  }

  if (user.lifecycle_state === 'terminated' || user.lifecycle_state === 'archived' || user.is_active === false) {
    return res.status(403).json({ error: 'Account is terminated or archived', code: 'FORBIDDEN' });
  }

  req.user = decoded; // company_id, userId, user_role always available downstream
  next();
});
