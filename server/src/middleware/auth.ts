import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/tokenService';
import { asyncHandler } from '../utils/asyncHandler';
import { User, UserRole } from '../models';
import { rbacCache } from '../lib/rbacCache';

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

  if (user.lifecycle_state === 'deactivated' || user.lifecycle_state === 'archived' || user.lifecycle_state === 'terminated' || user.is_active === false) {
    return res.status(403).json({ error: 'Your account is currently inactive. Please contact support if you believe this is an error.', code: 'FORBIDDEN' });
  }

  // Fetch actual user role dynamically with caching
  const userIdStr = decoded.userId;
  let userRole: any = rbacCache.getUserRole(userIdStr);
  if (!userRole) {
    const userRoleAssignment = await UserRole.findOne({ user_id: decoded.userId }).populate('role_id');
    userRole = (userRoleAssignment?.role_id as any)?.name || 'Employee';
    rbacCache.setUserRole(userIdStr, userRole);
  }

  req.user = {
    ...decoded,
    user_role: userRole, // Override static claim with fresh database/cache role
  };
  next();
});
