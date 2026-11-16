// server/src/operator/permissions.ts
// Operator roles and permissions (DRD §4.5, Plan 4.1). A static map: roles are not stored per permission.
// `products.write` (standalone portal registration) is left out until Phase 6.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const OPERATOR_ROLES = ['platform_admin', 'operations', 'support', 'auditor'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

const READ = ['overview.read', 'tenants.read', 'products.read', 'health.read'] as const;

export const ROLE_PERMISSIONS: Record<OperatorRole, readonly string[]> = {
  platform_admin: [
    ...READ, 'notes.write', 'onboarding.write', 'tenants.write', 'tenants.close', 'entitlements.write', 'plans.write',
    'announcements.write', 'audit.read', 'security.read', 'audit.export', 'operators.read', 'operators.write',
  ],
  operations: [...READ, 'notes.write', 'onboarding.write', 'tenants.write', 'entitlements.write', 'announcements.write'],
  support: [...READ, 'notes.write', 'onboarding.write'],
  auditor: [...READ, 'audit.read', 'security.read', 'audit.export', 'operators.read'],
};

export type OperatorPermission = (typeof ROLE_PERMISSIONS)['platform_admin'][number];

/** Request-body shape for a role list (POST/PATCH /operators). */
export const operatorRolesSchema = z.array(z.enum(OPERATOR_ROLES)).min(1);

export const isOperatorRole = (r: string): r is OperatorRole => (OPERATOR_ROLES as readonly string[]).includes(r);

/** Union of the permissions of every known role the operator holds, sorted. Unknown role names grant nothing. */
export function permissionsFor(roles: readonly string[]): string[] {
  const out = new Set<string>();
  for (const r of roles) if (isOperatorRole(r)) for (const p of ROLE_PERMISSIONS[r]) out.add(p);
  return [...out].sort();
}

/** Marker read by the route-coverage test (`__tests__/permissions.test.ts`). */
export const PERMISSION_MARK = '__operatorPermission';

/** Route guard: the signed-in operator (set by requireOperator) must hold `perm`; otherwise 403 FORBIDDEN. */
export function requirePermission(perm: OperatorPermission) {
  const mw = (req: Request, res: Response, next: NextFunction) => {
    if (!req.operator || !permissionsFor(req.operator.roles).includes(perm)) {
      return res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
    }
    next();
  };
  (mw as any)[PERMISSION_MARK] = perm;
  return mw;
}

/** For routes any active operator may call (e.g. GET /me). Marked so the coverage test accepts it. */
export function anyOperator(_req: Request, _res: Response, next: NextFunction) { next(); }
(anyOperator as any)[PERMISSION_MARK] = '*';
