import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokenService';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'NO_TOKEN' });

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // company_id, userId, user_role always available downstream
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired', code: 'INVALID_TOKEN' });
  }
};
