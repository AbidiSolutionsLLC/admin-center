// Plan 4.1: the role map, and a walk of the operator router that fails when any route has no permission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes';
import { permissionsFor, requirePermission, PERMISSION_MARK, ROLE_PERMISSIONS } from '../permissions';

test('role map follows DRD 4.5', () => {
  const has = (role: string, p: string) => permissionsFor([role]).includes(p);
  for (const r of ['platform_admin', 'operations', 'support', 'auditor']) assert.ok(has(r, 'tenants.read') && has(r, 'overview.read'));
  assert.ok(has('platform_admin', 'tenants.close') && !has('operations', 'tenants.close'));
  assert.ok(has('operations', 'tenants.write') && !has('support', 'tenants.write'));
  assert.ok(has('support', 'notes.write') && !has('auditor', 'notes.write'));
  assert.ok(has('auditor', 'audit.export') && !has('operations', 'audit.read'));
  assert.ok(has('auditor', 'operators.read') && !has('auditor', 'operators.write'));
  assert.ok(!Object.values(ROLE_PERMISSIONS).some((l) => l.includes('products.write')));
  assert.deepEqual(permissionsFor(['nonsense']), []);
});

test('requirePermission: 403 without the permission, next() with it', () => {
  const run = (roles: string[]) => {
    let status = 0, nexted = false;
    const res: any = { status(c: number) { status = c; return this; }, json() { return this; } };
    requirePermission('tenants.write')({ operator: { roles } } as any, res, () => { nexted = true; });
    return { status, nexted };
  };
  assert.deepEqual(run(['support']), { status: 403, nexted: false });
  assert.deepEqual(run(['operations']), { status: 0, nexted: true });
});

// Routes that run without an operator token. Adding one here is a security decision: review it (plan 04 C2).
const PUBLIC_ROUTES = ['POST /invite/verify', 'POST /invite/accept'];

test('every /operator/v1 route carries a permission; only reviewed routes are public', () => {
  const missing: string[] = [];
  const publicSeen: string[] = [];
  let seen = 0;
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        seen++;
        const name = `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${prefix}${layer.route.path}`;
        const marks = layer.route.stack.map((l: any) => (l.handle as any)[PERMISSION_MARK]).filter(Boolean);
        if (!marks.length) missing.push(name);
        if (marks.includes('public')) publicSeen.push(name);
      } else if (layer.handle?.stack) walk(layer.handle.stack, prefix);
    }
  };
  walk((router as any).stack, '');
  assert.ok(seen >= 25, `expected to see the operator routes, saw ${seen}`);
  assert.deepEqual(missing, []);
  assert.deepEqual(publicSeen.sort(), [...PUBLIC_ROUTES].sort());
});
