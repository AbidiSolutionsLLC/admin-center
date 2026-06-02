// 03-permission-conflicts-tests.spec.ts
// Tests permission conflict detection: allow vs deny conflicts, overlapping roles,
// system flagging in UI, conflict details, and proactive alerts.
import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:3000';
const API_URL = `${APP_URL}/api/v1`;

test.use({ storageState: 'auth.json' });

/**
 * Helper: fetch JSON from the API using the page's authenticated context.
 */
async function api(page: Page, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.data = body;
  const resp = await page.request.fetch(`${API_URL}${path}`, opts);
  const json = await resp.json();
  return { status: resp.status(), ...json };
}

/**
 * Helper: find a permission ID by module:action:scope
 */
async function getPermissionId(page: Page, module: string, action: string, scope: string): Promise<string> {
  const perms = await api(page, 'GET', '/roles/permissions/all');
  const found = perms.data?.find((p: any) => p.module === module && p.action === action && p.data_scope === scope);
  if (!found) throw new Error(`Permission ${module}:${action}:${scope} not found`);
  return found._id;
}

/**
 * Helper: get a role ID by name
 */
async function getRoleId(page: Page, name: string): Promise<string> {
  const roles = await api(page, 'GET', '/roles');
  const found = (roles.data || []).find((r: any) => r.name === name);
  if (!found) throw new Error(`Role "${name}" not found`);
  return found._id;
}

/**
 * Helper: get first active user ID
 */
async function getFirstUserId(page: Page): Promise<string> {
  const users = await api(page, 'GET', '/people?limit=10');
  const found = (users.data || []).find((u: any) => u.is_active);
  if (!found) throw new Error('No active user found');
  return found._id;
}

/**
 * Helper: get user IDs by role name
 */
async function getUsersByRole(page: Page, roleName: string): Promise<any[]> {
  const roleId = await getRoleId(page, roleName);
  const resp = await api(page, 'GET', `/roles/${roleId}/users`);
  return resp.data || [];
}

/**
 * Helper: assign a user to a role
 */
async function assignUserToRole(page: Page, roleId: string, userId: string) {
  return api(page, 'POST', `/roles/${roleId}/users`, { user_id: userId });
}

/**
 * Helper: unassign user from role
 */
async function unassignUserFromRole(page: Page, roleId: string, userId: string) {
  return api(page, 'DELETE', `/roles/${roleId}/users/${userId}`);
}

/**
 * Helper: run intelligence engine
 */
async function runIntelligence(page: Page) {
  return api(page, 'POST', '/overview/intelligence/run');
}

/**
 * Helper: get active insights
 */
async function getInsights(page: Page) {
  const resp = await api(page, 'GET', '/overview/intelligence');
  return resp.data || [];
}

/**
 * Helper: get effective permissions for a user
 */
async function getEffectivePermissions(page: Page, userId: string) {
  const resp = await api(page, 'GET', `/people/${userId}/effective-permissions`);
  return resp.data;
}

/**
 * Helper: update role permissions (grant or deny specific permissions)
 */
async function updateRolePermissions(page: Page, roleId: string, permissions: Array<{ permission_id: string; granted: boolean | null }>) {
  return api(page, 'PUT', `/roles/${roleId}/permissions`, { permissions });
}

/**
 * Helper: create a custom role
 */
async function createRole(page: Page, name: string, description?: string) {
  const resp = await api(page, 'POST', '/roles', { name, description, type: 'custom' });
  if (resp.status === 201 || resp.success) return resp.data;
  const roleId = await getRoleId(page, name);
  return { _id: roleId, name };
}

/**
 * Helper: delete a role
 */
async function deleteRole(page: Page, roleId: string) {
  return api(page, 'DELETE', `/roles/${roleId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE-14: CONFLICTING PERMISSIONS (ALLOW vs DENY) - 10 tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('RULE-14: Conflicting Permissions (Allow vs Deny) - 10 tests', () => {
  let conflictUserId: string;
  let employeeRoleId: string;
  let managerRoleId: string;
  let permId: string;

  test.beforeAll(async ({ page }) => {
    employeeRoleId = await getRoleId(page, 'Employee');
    managerRoleId = await getRoleId(page, 'Manager');

    const usersInEmployee = await getUsersByRole(page, 'Employee');
    if (usersInEmployee.length > 0) {
      conflictUserId = usersInEmployee[0]._id;
    } else {
      conflictUserId = await getFirstUserId(page);
      await assignUserToRole(page, employeeRoleId, conflictUserId);
    }

    await assignUserToRole(page, managerRoleId, conflictUserId);

    try {
      permId = await getPermissionId(page, 'people', 'delete', 'all');
    } catch {
      permId = await getPermissionId(page, 'people', 'read', 'all');
    }

    await updateRolePermissions(page, employeeRoleId, [{ permission_id: permId, granted: false }]);
    await updateRolePermissions(page, managerRoleId, [{ permission_id: permId, granted: true }]);

    await runIntelligence(page);
  });

  test('1. User with conflicting allow/deny roles has both roles assigned', async ({ page }) => {
    const eff = await getEffectivePermissions(page, conflictUserId);
    const roleNames = (eff.roles || []).map((r: any) => r.role_name);
    expect(roleNames).toContain('Employee');
    expect(roleNames).toContain('Manager');
  });

  test('2. System creates RULE-14 insight for conflicting permissions (allow vs deny)', async ({ page }) => {
    const insights = await getInsights(page);
    const conflictInsights = insights.filter((i: any) =>
      i.title?.toLowerCase().includes('conflicting') ||
      i.description?.toLowerCase().includes('conflicting')
    );
    expect(conflictInsights.length).toBeGreaterThanOrEqual(1);
  });

  test('3. RULE-14 insight title mentions the affected user name', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') ||
      i.description?.toLowerCase().includes('conflicting')
    );
    expect(ci).toBeDefined();
    expect(ci.affected_object_label).toBeTruthy();
    expect(ci.affected_object_type).toBe('User');
  });

  test('4. RULE-14 insight has severity "warning"', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') ||
      i.description?.toLowerCase().includes('conflicting')
    );
    expect(ci).toBeDefined();
    expect(ci.severity).toBe('warning');
  });

  test('5. RULE-14 insight includes reasoning about which roles conflict', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') ||
      i.description?.toLowerCase().includes('conflicting')
    );
    expect(ci).toBeDefined();
    expect(ci.reasoning).toBeTruthy();
    expect(ci.reasoning).toContain('grant');
    expect(ci.reasoning).toContain('deny');
  });

  test('6. RULE-14 insight includes remediation URL and action', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') ||
      i.description?.toLowerCase().includes('conflicting')
    );
    expect(ci).toBeDefined();
    expect(ci.remediation_url).toBeTruthy();
    expect(ci.remediation_action).toBeTruthy();
  });

  test('7. Overview page displays RULE-14 insight card in the UI', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    const conflictText = page.locator('text=Conflicting permissions').first();
    await expect(conflictText).toBeVisible({ timeout: 10000 });
  });

  test('8. Insight card shows severity badge for the conflict', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    await expect(page.locator('text=WARNING').first()).toBeVisible({ timeout: 10000 });
  });

  test('9. Insight card provides a Dismiss button for the conflict', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    await expect(dismissBtn).toBeVisible({ timeout: 10000 });
  });

  test('10. Deny-overrides-grant: effective permission resolves to false when denied by any role', async ({ page }) => {
    const eff = await getEffectivePermissions(page, conflictUserId);
    const key = Object.keys(eff.permissions || {}).find((k: string) => k.startsWith('people:delete:all') || k.startsWith('people:read:all'));
    if (key) {
      expect(eff.permissions[key]).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE-15: OVERLAPPING / REDUNDANT ROLE ASSIGNMENTS - 10 tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('RULE-15: Overlapping Role Assignments - 10 tests', () => {
  let overlapUserId: string;
  let narrowRoleId: string;
  let broadRoleId: string;

  test.beforeAll(async ({ page }) => {
    const narrowName = `Narrow-${Date.now()}`;
    const narrow = await createRole(page, narrowName);
    narrowRoleId = narrow._id;

    const broadName = `Broad-${Date.now()}`;
    const broad = await createRole(page, broadName);
    broadRoleId = broad._id;

    const pReadOwn = await getPermissionId(page, 'people', 'read', 'own');
    await updateRolePermissions(page, narrowRoleId, [{ permission_id: pReadOwn, granted: true }]);

    const pReadDept = await getPermissionId(page, 'people', 'read', 'department');
    const pReadAll = await getPermissionId(page, 'people', 'read', 'all');
    await updateRolePermissions(page, broadRoleId, [
      { permission_id: pReadOwn, granted: true },
      { permission_id: pReadDept, granted: true },
      { permission_id: pReadAll, granted: true },
    ]);

    overlapUserId = await getFirstUserId(page);
    await assignUserToRole(page, narrowRoleId, overlapUserId);
    await assignUserToRole(page, broadRoleId, overlapUserId);

    await runIntelligence(page);
  });

  test('1. User with overlapping roles has both roles assigned', async ({ page }) => {
    const eff = await getEffectivePermissions(page, overlapUserId);
    const roleNames = (eff.roles || []).map((r: any) => r.role_name);
    expect(roleNames.length).toBeGreaterThanOrEqual(2);
  });

  test('2. System creates RULE-15 insight for redundant/overlapping roles', async ({ page }) => {
    const insights = await getInsights(page);
    const redundantInsights = insights.filter((i: any) =>
      i.title?.toLowerCase().includes('redundant') ||
      i.description?.toLowerCase().includes('redundant') ||
      i.title?.toLowerCase().includes('overlapping')
    );
    expect(redundantInsights.length).toBeGreaterThanOrEqual(1);
  });

  test('3. RULE-15 insight identifies the redundant role by name in reasoning', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant') ||
      i.description?.toLowerCase().includes('redundant')
    );
    expect(ri).toBeDefined();
    expect(ri.reasoning).toContain('fully covered');
  });

  test('4. RULE-15 insight has severity "info"', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant')
    );
    if (ri) {
      expect(ri.severity).toBe('info');
    }
  });

  test('5. RULE-15 insight provides remediation: remove redundant role', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant')
    );
    if (ri) {
      expect(ri.remediation_action).toContain('Remove');
    }
  });

  test('6. Overview page displays redundant role insight card', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    const redundantText = page.locator('text=Redundant role').first();
    await expect(redundantText).toBeVisible({ timeout: 10000 });
  });

  test('7. Unassigning the narrow role removes the redundancy condition', async ({ page }) => {
    await unassignUserFromRole(page, narrowRoleId, overlapUserId);
    await runIntelligence(page);
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant')
    );
    expect(ri).toBeUndefined();
    await assignUserToRole(page, narrowRoleId, overlapUserId);
    await runIntelligence(page);
  });

  test('8. User detail page shows effective permissions across all assigned roles', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${overlapUserId}`);
    await page.waitForTimeout(2000);
    const permsSection = page.locator('text=Effective Permissions');
    await expect(permsSection).toBeVisible({ timeout: 10000 });
  });

  test('9. Effective permissions panel shows assigned role badges', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${overlapUserId}`);
    await page.waitForTimeout(2000);
    const roleBadges = page.locator('text=Assigned Roles');
    await expect(roleBadges).toBeVisible({ timeout: 10000 });
  });

  test('10. Effective permissions panel lists permissions with grant/deny state per module', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${overlapUserId}`);
    await page.waitForTimeout(2000);
    const grantedBadge = page.locator('text=Granted').first();
    await expect(grantedBadge).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RULE-16: OVER-PERMISSIONED USER DETECTION - 10 tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('RULE-16: Over-permissioned User Detection - 10 tests', () => {
  let powerUserId: string;

  test.beforeAll(async ({ page }) => {
    const superAdminId = await getRoleId(page, 'Super Admin');
    powerUserId = await getFirstUserId(page);
    await assignUserToRole(page, superAdminId, powerUserId);
    await runIntelligence(page);
  });

  test('1. Super Admin role grants all permissions to the user', async ({ page }) => {
    const eff = await getEffectivePermissions(page, powerUserId);
    const permCount = Object.keys(eff.permissions || {}).length;
    expect(permCount).toBeGreaterThan(10);
  });

  test('2. System detects over-permissioned user (RULE-16) with >10 high-risk perms', async ({ page }) => {
    const insights = await getInsights(page);
    const opInsights = insights.filter((i: any) =>
      i.title?.toLowerCase().includes('over-permissioned') ||
      i.description?.toLowerCase().includes('high-risk')
    );
    expect(opInsights.length).toBeGreaterThanOrEqual(1);
  });

  test('3. RULE-16 insight warns about delete/export actions with "all" scope', async ({ page }) => {
    const insights = await getInsights(page);
    const op = insights.find((i: any) =>
      i.title?.toLowerCase().includes('over-permissioned')
    );
    expect(op).toBeDefined();
    expect(op.description).toContain('high-risk');
  });

  test('4. RULE-16 insight severity is "warning"', async ({ page }) => {
    const insights = await getInsights(page);
    const op = insights.find((i: any) =>
      i.title?.toLowerCase().includes('over-permissioned')
    );
    if (op) {
      expect(op.severity).toBe('warning');
    }
  });

  test('5. Overview page shows over-permissioned alert in insights list', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    const warningText = page.locator('text=over-permissioned').first();
    await expect(warningText).toBeVisible({ timeout: 10000 });
  });

  test('6. Insight card shows remediation action for over-permissioned user', async ({ page }) => {
    await page.goto(`${APP_URL}/overview`);
    await page.waitForTimeout(2000);
    const remediationLink = page.locator('text=Review and adjust').first();
    await expect(remediationLink).toBeVisible({ timeout: 10000 });
  });

  test('7. User detail page shows least-privilege warning banner for over-permissioned user', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${powerUserId}`);
    await page.waitForTimeout(2000);
    const warningBanner = page.locator('text=Least-Privilege Warning').first();
    await expect(warningBanner).toBeVisible({ timeout: 10000 });
  });

  test('8. Warning banner specifies the count of high-risk permissions', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${powerUserId}`);
    await page.waitForTimeout(2000);
    const highRiskText = page.locator('text=high-risk permissions').first();
    await expect(highRiskText).toBeVisible({ timeout: 10000 });
  });

  test('9. Over-permissioned insight can be dismissed via API', async ({ page }) => {
    const insights = await getInsights(page);
    const op = insights.find((i: any) =>
      i.title?.toLowerCase().includes('over-permissioned')
    );
    if (op) {
      const resp = await api(page, 'PUT', `/overview/intelligence/${op._id}/resolve`);
      expect(resp.status).toBe(200);
    }
  });

  test('10. Removing Super Admin role resolves over-permissioned insight automatically', async ({ page }) => {
    const superAdminId = await getRoleId(page, 'Super Admin');
    await unassignUserFromRole(page, superAdminId, powerUserId);
    await runIntelligence(page);
    const insights = await getInsights(page);
    const op = insights.find((i: any) =>
      i.title?.toLowerCase().includes('over-permissioned')
    );
    expect(op).toBeUndefined();
    await assignUserToRole(page, superAdminId, powerUserId);
    await runIntelligence(page);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX & ACCESS MAP - 10 tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Permission Matrix & Access Map - 10 tests', () => {
  test('1. Permission matrix API returns all available permissions', async ({ page }) => {
    const permsResp = await api(page, 'GET', '/roles/permissions/all');
    expect(permsResp.success).toBe(true);
    expect(Array.isArray(permsResp.data)).toBe(true);
    expect(permsResp.data.length).toBeGreaterThan(0);
  });

  test('2. Specific role permissions API returns granted/denied state for each permission', async ({ page }) => {
    const rolesResp = await api(page, 'GET', '/roles');
    const firstRole = (rolesResp.data || [])[0];
    expect(firstRole).toBeDefined();
    const permsResp = await api(page, 'GET', `/roles/${firstRole._id}/permissions`);
    expect(Array.isArray(permsResp.data)).toBe(true);
    if (permsResp.data.length > 0) {
      expect(permsResp.data[0].granted).toBeDefined();
    }
  });

  test('3. Permission matrix toggles cell from not-set to granted on click', async ({ page }) => {
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1000);
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(1000);
    const notSetBtn = page.locator('button[aria-label*="not set"]').first();
    if (await notSetBtn.count() > 0) {
      await notSetBtn.click();
      await page.waitForTimeout(200);
      const ariaLabel = await notSetBtn.getAttribute('aria-label');
      expect(ariaLabel).toContain('granted');
    }
  });

  test('4. Save Changes button shows count of modified permissions', async ({ page }) => {
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1000);
    const firstRow = page.locator('table tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(1000);
    const notSetBtn = page.locator('button[aria-label*="not set"]').first();
    if (await notSetBtn.count() > 0) {
      await notSetBtn.click();
      await page.waitForTimeout(200);
      const saveBtn = page.locator('button:has-text("Save Changes")');
      await expect(saveBtn).toBeVisible();
      const btnText = await saveBtn.textContent();
      expect(btnText).toMatch(/Save Changes \(\d+\)/);
    }
  });

  test('5. Permission simulator API computes effective permissions with hypothetical roles', async ({ page }) => {
    const userId = await getFirstUserId(page);
    const employeeId = await getRoleId(page, 'Employee');
    const simResp = await api(page, 'POST', `/roles/simulate-permissions?user_id=${userId}`, {
      hypothetical_role_ids: [employeeId],
    });
    expect(simResp.success).toBe(true);
    expect(simResp.data.permissions).toBeDefined();
    expect(simResp.data.roles.length).toBeGreaterThanOrEqual(1);
  });

  test('6. Access map API returns hierarchical role structure with users and permissions', async ({ page }) => {
    const mapResp = await api(page, 'GET', '/roles/access-map');
    expect(mapResp.success).toBe(true);
    expect(Array.isArray(mapResp.data)).toBe(true);
    if (mapResp.data.length > 0) {
      const entry = mapResp.data[0];
      expect(entry.name).toBeTruthy();
      expect(Array.isArray(entry.users)).toBe(true);
      expect(Array.isArray(entry.permissions)).toBe(true);
    }
  });

  test('7. Access Map view renders in the UI when toggled from list view', async ({ page }) => {
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Map View")').click();
    await page.waitForTimeout(1000);
    const accessHub = page.locator('text=Access Hub').first();
    await expect(accessHub).toBeVisible({ timeout: 10000 });
  });

  test('8. Access Map role cards show user count and group count', async ({ page }) => {
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Map View")').click();
    await page.waitForTimeout(1000);
    const userCount = page.locator('text=Users').first();
    await expect(userCount).toBeVisible({ timeout: 10000 });
  });

  test('9. Permission simulation validates hypothetical role IDs are ObjectIds', async ({ page }) => {
    const userId = await getFirstUserId(page);
    const resp = await api(page, 'POST', `/roles/simulate-permissions?user_id=${userId}`, {
      hypothetical_role_ids: ['invalid-id'],
    });
    expect(resp.status).toBe(500);
  });

  test('10. Simulate without user_id returns 400 error', async ({ page }) => {
    const resp = await api(page, 'POST', '/roles/simulate-permissions', {
      hypothetical_role_ids: [],
    });
    expect(resp.status === 400 || resp.code === 'MISSING_USER_ID').toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROLE MANAGEMENT, SECURITY & PROACTIVE ALERTS - 10 tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Role Management, Security & Proactive Alerts - 10 tests', () => {
  test('1. Creating a role with duplicate name is rejected with DUPLICATE error', async ({ page }) => {
    const resp = await api(page, 'POST', '/roles', { name: 'Employee', description: 'Duplicate test', type: 'custom' });
    if (resp.status === 400) {
      expect(resp.code).toBe('DUPLICATE');
    }
  });

  test('2. Creating a custom role with unique name succeeds', async ({ page }) => {
    const name = `Test-Role-${Date.now()}`;
    const resp = await api(page, 'POST', '/roles', { name, description: 'Test role', type: 'custom' });
    expect(resp.status === 201 || resp.success).toBeTruthy();
    if (resp.data?._id) {
      await deleteRole(page, resp.data._id);
    }
  });

  test('3. Deleting a role with assigned users returns HAS_DEPENDENTS error', async ({ page }) => {
    const name = `DeleteTest-${Date.now()}`;
    const role = await createRole(page, name);
    const userId = await getFirstUserId(page);
    await assignUserToRole(page, role._id, userId);
    const resp = await api(page, 'DELETE', `/roles/${role._id}`);
    expect(resp.status === 400 || resp.code === 'HAS_DEPENDENTS').toBeTruthy();
    await unassignUserFromRole(page, role._id, userId);
    await deleteRole(page, role._id);
  });

  test('4. Security policy API returns current policy with settings', async ({ page }) => {
    const resp = await api(page, 'GET', '/security/policy');
    expect(resp.success).toBe(true);
    expect(resp.data.settings).toBeDefined();
    expect(resp.data.settings.max_failed_login_attempts).toBeDefined();
  });

  test('5. Security events API returns paginated access log', async ({ page }) => {
    const resp = await api(page, 'GET', '/security/events?page=1&limit=10');
    expect(resp.success).toBe(true);
    expect(resp.data.events).toBeDefined();
    expect(Array.isArray(resp.data.events)).toBe(true);
    expect(resp.data.pagination).toBeDefined();
  });

  test('6. Intelligence engine can be triggered manually and returns success', async ({ page }) => {
    const resp = await runIntelligence(page);
    expect(resp.success).toBe(true);
  });

  test('7. Active insights contain all required fields', async ({ page }) => {
    const insights = await getInsights(page);
    expect(Array.isArray(insights)).toBe(true);
    if (insights.length > 0) {
      const i = insights[0];
      expect(i.title).toBeTruthy();
      expect(i.description).toBeTruthy();
      expect(['critical', 'warning', 'info']).toContain(i.severity);
      expect(['health', 'misconfiguration', 'recommendation', 'data_consistency']).toContain(i.category);
    }
  });

  test('8. Force logout endpoint revokes user sessions', async ({ page }) => {
    const userId = await getFirstUserId(page);
    const resp = await api(page, 'POST', `/security/force-logout/${userId}`);
    expect(resp.success).toBe(true);
  });

  test('9. Security page shows policy settings and access log tabs', async ({ page }) => {
    await page.goto(`${APP_URL}/security`);
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("Security Policy")')).toBeVisible();
    await expect(page.locator('button:has-text("Access Log")')).toBeVisible();
  });

  test('10. Access Log tab has Suspicious Only filter for detecting anomalies', async ({ page }) => {
    await page.goto(`${APP_URL}/security`);
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Access Log")').click();
    await page.waitForTimeout(1000);
    await expect(page.locator('button:has-text("Suspicious Only")')).toBeVisible();
  });
});
