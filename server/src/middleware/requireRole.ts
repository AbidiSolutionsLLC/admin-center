// server/src/middleware/requireRole.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

/**
 * Middleware that checks if the authenticated user has one of the required roles.
 * Should be used after requireAuth middleware.
 *
 * @param allowedRoles - Array of role names that are allowed access
 * @returns Express middleware function
 *
 * @example
 * // Only super admins and ops admins can access
 * router.post('/something', requireRole(['Super Admin', 'Ops Admin']), handler);
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user is set by requireAuth middleware
    const userRole = (req.user as any)?.user_role;

    if (!userRole) {
      throw new AppError(
        'User role not found in token',
        403,
        'MISSING_ROLE'
      );
    }

    // Check if user's role is in the allowed roles list
    const hasAccess = allowedRoles.includes(userRole);

    if (!hasAccess) {
      throw new AppError(
        'Insufficient permissions for this action',
        403,
        'INSUFFICIENT_ROLE'
      );
    }

    next();
  };
};
