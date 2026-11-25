// server/src/routes/__tests__/securityEventsGuard.test.ts
// Regression (2026-11-25 browser test): GET /security/events had no role check, so any member could read the
// organisation's access log. Runs the route's own guards (everything before the controller) for each role.
import crypto from 'crypto';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

import { test } from 'node:test';
import assert from 'node:assert/strict';
import securityRoutes from '../security.routes';
import { ROLES } from '../../constants/roles';

function guardsOf(method: string, path: string) {
  const layer = (securityRoutes as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  assert.ok(layer, `route ${method} ${path} exists`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers.slice(0, -1); // the last handler is the controller
}

function passes(role: string): boolean {
  const req: any = { user: { user_role: role, company_id: 'c1' } };
  try {
    for (const g of guardsOf('get', '/events')) {
      let called = false;
      g(req, {}, () => { called = true; });
      if (!called) return false;
    }
    return true;
  } catch {
    return false;
  }
}

test('GET /security/events: IT admins pass, other members are refused', () => {
  assert.equal(guardsOf('get', '/events').length > 0, true);
  for (const r of [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.IT_ADMIN]) assert.equal(passes(r), true, r);
  for (const r of Object.values(ROLES).filter((x) => ![ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.IT_ADMIN].includes(x as any))) {
    assert.equal(passes(r as string), false, r as string);
  }
});
