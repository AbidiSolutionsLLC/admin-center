// WI-16: security baseline unit tests (no database). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrant, rankOf, maxRank, CUSTOM_ROLE_RANK } from '../roleHierarchy';
import { RBACCache } from '../rbacCache';
import { requireRole } from '../../middleware/requireRole';
import { ROLES } from '../../constants/roles';

const SA = { name: ROLES.SUPER_ADMIN, type: 'system' };
const HRA = { name: ROLES.HR_ADMIN, type: 'system' };
const EMP = { name: ROLES.EMPLOYEE, type: 'system' };
const CUSTOM = { name: 'Payroll Reviewer', type: 'custom' };

test('rank: system roles ordered, custom roles treated as administrative', () => {
  assert.ok(rankOf(SA) > rankOf(HRA));
  assert.ok(rankOf(HRA) > rankOf(EMP));
  assert.equal(rankOf(CUSTOM), CUSTOM_ROLE_RANK);
  assert.equal(maxRank([EMP, HRA]), rankOf(HRA));
});

test('grant: HR Admin cannot grant Super Admin', () => {
  const err = checkGrant({ actorId: 'a', actorRank: rankOf(HRA), rolesToGrant: [SA], targets: [{ userId: 'b', rank: 0 }] });
  assert.match(err ?? '', /Only a Super Admin/);
});

test('grant: Super Admin can grant Super Admin', () => {
  assert.equal(checkGrant({ actorId: 'a', actorRank: rankOf(SA), rolesToGrant: [SA], targets: [{ userId: 'b', rank: 0 }] }), null);
});

test('grant: nobody can change their own roles', () => {
  const err = checkGrant({ actorId: 'a', actorRank: rankOf(SA), rolesToGrant: [EMP], targets: [{ userId: 'a', rank: rankOf(SA) }] });
  assert.match(err ?? '', /own roles/);
});

test('grant: cannot manage a user who outranks you', () => {
  const err = checkGrant({ actorId: 'a', actorRank: rankOf(HRA), rolesToGrant: [EMP], targets: [{ userId: 'b', rank: rankOf(SA) }] });
  assert.match(err ?? '', /higher privileges/);
});

test('grant: HR Admin may grant Employee to an Employee', () => {
  assert.equal(checkGrant({ actorId: 'a', actorRank: rankOf(HRA), rolesToGrant: [EMP], targets: [{ userId: 'b', rank: 0 }] }), null);
});

test('rbacCache: entries expire after the TTL', async () => {
  process.env.RBAC_CACHE_TTL_MS = '20';
  const cache = new RBACCache();
  cache.setUserRole('u1', ROLES.SUPER_ADMIN);
  cache.setUserDepartment('u1', null);
  assert.equal(cache.getUserRole('u1'), ROLES.SUPER_ADMIN);
  assert.equal(cache.getUserDepartment('u1'), null);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cache.getUserRole('u1'), undefined);
  assert.equal(cache.getUserDepartment('u1'), undefined);
  delete process.env.RBAC_CACHE_TTL_MS;
});

test('requireRole: exact role names; snake_case literals never match seeded roles', () => {
  const run = (role: string, allowed: string[]) => {
    let passed = false;
    try {
      requireRole(allowed)({ user: { user_role: role } } as any, {} as any, () => { passed = true; });
    } catch {
      passed = false;
    }
    return passed;
  };
  assert.equal(run(ROLES.SUPER_ADMIN, [ROLES.SUPER_ADMIN]), true);
  assert.equal(run(ROLES.SUPER_ADMIN, ['super_admin']), false);
  assert.equal(run(ROLES.EMPLOYEE, [ROLES.SUPER_ADMIN, ROLES.OPS_ADMIN]), false);
});
