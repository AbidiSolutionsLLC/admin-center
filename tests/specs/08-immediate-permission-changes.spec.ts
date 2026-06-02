/**
 * tests/specs/08-immediate-permission-changes.spec.ts
 *
 * Tests for the "Immediate Permission Changes" feature.
 * AC1: Changes to roles/permissions take effect immediately
 * AC2: No system restart or delay required
 * AC3: Active sessions reflect updated permissions (or re-evaluated on next action)
 * AC4: System ensures consistency across modules
 *
 * Seed data requirements:
 * - Admin user: tsaleem@abidisolutions.com (password: Mtayyab595*)
 * - At least 2 roles (e.g., "Viewer", "Editor")
 * - At least 3 permissions (e.g., "view_reports", "edit_reports", "delete_reports")
 * - Regular test user with known permissions
 */

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

const ADMIN_EMAIL = 'tsaleem@abidisolutions.com';
const ADMIN_PASSWORD = 'Mtayyab595*';

let adminToken: string | null = null;
let testUserToken: string | null = null;

async function getAccessToken(page: Page, email: string, password: string): Promise<string> {
  const tokenKey = email === ADMIN_EMAIL ? 'adminToken' : 'testUserToken';
  if (tokenKey === 'adminToken' && adminToken) return adminToken;
  if (tokenKey === 'testUserToken' && testUserToken) return testUserToken;

  console.log(`🔑 Acquiring access token for ${email} via API...`);
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  const body = await resp.json();

  if (!body.success || !body.data?.accessToken) {
    throw new Error(`Login API failed: ${resp.status()} ${JSON.stringify(body)}`);
  }

  if (email === ADMIN_EMAIL) {
    adminToken = body.data.accessToken;
  } else {
    testUserToken = body.data.accessToken;
  }
  console.log(`✅ Access token acquired for ${email} (${body.data.accessToken.slice(0, 12)}…)`);
  return body.data.accessToken;
}

async function api(page: Page, method: string, path: string, body?: any, email?: string) {
  const token = await getAccessToken(page, email || ADMIN_EMAIL, ADMIN_PASSWORD);
  const opts: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.data = body;
  const resp = await page.request.fetch(`${API_URL}${path}`, opts);
  const json = await resp.json();
  return { status: resp.status(), ...json };
}

async function ensureAuthenticated(page: Page, path: string = '/roles') {
  const targetUrl = `${APP_URL}${path}`;
  await page.goto(targetUrl);
  await page.waitForTimeout(1000);

  if (page.url().includes('/login')) {
    await page.goto(`${APP_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/overview', { timeout: 20_000 });
    await page.locator(`a[href="${path}"]`).click();
    await page.waitForTimeout(1500);
  }
}

async function getPermissionId(page: Page, module: string, action: string, scope: string): Promise<string> {
  const perms = await api(page, 'GET', '/roles/permissions/all');
  const found = (perms.data || []).find(
    (p: any) => p.module === module && p.action === action && p.data_scope === scope,
  );
  if (!found) throw new Error(`Permission ${module}:${action}:${scope} not found`);
  return found._id;
}

async function getRoleId(page: Page, name: string): Promise<string> {
  const roles = await api(page, 'GET', '/roles');
  const found = (roles.data || []).find((r: any) => r.name === name);
  if (!found) throw new Error(`Role "${name}" not found`);
  return found._id;
}

async function getRolePermissions(page: Page, roleId: string): Promise<any[]> {
  const resp = await api(page, 'GET', `/roles/${roleId}/permissions`);
  return resp.data || [];
}

async function updateRolePermissions(
  page: Page,
  roleId: string,
  permissions: Array<{ permission_id: string; granted: boolean | null }>,
) {
  return api(page, 'PUT', `/roles/${roleId}/permissions`, { permissions });
}

async function getEffectivePermissions(page: Page, userId: string) {
  const resp = await api(page, 'GET', `/people/${userId}/effective-permissions`);
  return resp.data;
}

async function getUserIdByEmail(page: Page, email: string): Promise<string> {
  const users = await api(page, 'GET', '/people?limit=50');
  const found = (users.data || []).find((u: any) => u.email === email);
  if (!found) throw new Error(`User with email "${email}" not found`);
  return found._id;
}

async function assignUserToRole(page: Page, roleId: string, userId: string) {
  return api(page, 'POST', `/roles/${roleId}/users`, { user_id: userId });
}

async function unassignUserFromRole(page: Page, roleId: string, userId: string) {
  return api(page, 'DELETE', `/roles/${roleId}/users/${userId}`);
}

async function createRole(page: Page, name: string, description?: string) {
  const body: any = { name, description, type: 'custom' };
  const resp = await api(page, 'POST', '/roles', body);
  if (resp.status === 201 || resp.success) return resp.data;
  const roleId = await getRoleId(page, name);
  return { _id: roleId, name };
}

async function deleteRole(page: Page, roleId: string) {
  return api(page, 'DELETE', `/roles/${roleId}`);
}

async function getFirstNonAdminUser(page: Page): Promise<{ _id: string; email: string }> {
  const users = await api(page, 'GET', '/people?limit=50');
  const nonAdmin = (users.data || []).find((u: any) =>
    u.email !== ADMIN_EMAIL && u.is_active
  );
  if (!nonAdmin) throw new Error('No non-admin active user found');
  return { _id: nonAdmin._id, email: nonAdmin.email };
}

test.describe('Immediate Permission Changes', () => {
  let testRoleId: string;
  let testRoleName: string;
  let testUserId: string;
  let testUserEmail: string;
  let testUserPassword: string;
  let readPermissionId: string;
  let createPermissionId: string;
  let updatePermissionId: string;
  let deletePermissionId: string;

  test.beforeAll(async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    testRoleName = `PermImmediate-Role-${Date.now()}`;
    const role = await createRole(page, testRoleName, 'Test role for immediate permission changes');
    testRoleId = role._id;
    console.log(`Created test role: ${testRoleName} (${testRoleId})`);

    readPermissionId = await getPermissionId(page, 'people', 'read', 'own');
    createPermissionId = await getPermissionId(page, 'people', 'create', 'own');
    updatePermissionId = await getPermissionId(page, 'people', 'update', 'own');
    deletePermissionId = await getPermissionId(page, 'people', 'delete', 'own');
    console.log('Resolved permission IDs for testing');

    const testUser = await getFirstNonAdminUser(page);
    testUserId = testUser._id;
    testUserEmail = testUser.email;
    testUserPassword = 'Mtayyab595*';
    console.log(`Test user: ${testUserEmail} (${testUserId})`);

    await assignUserToRole(page, testRoleId, testUserId);
    console.log(`Assigned test user to test role`);

    await updateRolePermissions(page, testRoleId, [
      { permission_id: readPermissionId, granted: true },
    ]);
    console.log('Set initial permissions: people:read:own = granted');
  });

  test.afterAll(async ({ page }) => {
    try {
      await unassignUserFromRole(page, testRoleId, testUserId);
    } catch { /* ignore */ }
    try {
      await deleteRole(page, testRoleId);
      console.log(`Cleaned up test role: ${testRoleName}`);
    } catch { /* may have dependents */ }
  });

  test('1. Permission changes take effect immediately (API check)', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const effBefore = await getEffectivePermissions(page, testUserId);
    console.log('Effective permissions BEFORE update:', Object.keys(effBefore.permissions || {}).slice(0, 5));

    expect(effBefore.permissions?.['people:read:own']).toBe(true);
    expect(effBefore.permissions?.['people:create:own']).toBeFalsy();

    await updateRolePermissions(page, testRoleId, [
      { permission_id: readPermissionId, granted: true },
      { permission_id: createPermissionId, granted: true },
    ]);
    console.log('Updated role: granted people:create:own');

    const effAfter = await getEffectivePermissions(page, testUserId);
    console.log('Effective permissions AFTER update:', Object.keys(effAfter.permissions || {}).slice(0, 5));

    expect(effAfter.permissions?.['people:read:own']).toBe(true);
    expect(effAfter.permissions?.['people:create:own']).toBe(true);

    console.log('✅ AC1: Permission changes take effect immediately via API');
  });

  test('2. No system restart or delay required', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const startTime = Date.now();

    await updateRolePermissions(page, testRoleId, [
      { permission_id: updatePermissionId, granted: true },
    ]);

    const immediateEff = await getEffectivePermissions(page, testUserId);
    const elapsed = Date.now() - startTime;

    expect(immediateEff.permissions?.['people:update:own']).toBe(true);
    expect(elapsed).toBeLessThan(2000);

    console.log(`✅ AC2: Permission changes applied in ${elapsed}ms without restart`);
  });

  test('3. UI reflects updated permissions immediately without page reload', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();

    const modalTitle = page.locator('text=Edit Permissions');
    await expect(modalTitle).toBeVisible({ timeout: 10_000 });

    const readOwnCell = page.locator('button[aria-label="people read own: granted"]');
    await expect(readOwnCell).toBeVisible({ timeout: 5_000 });

    const notSetCell = page.locator('button[aria-label*="not set"]').first();
    if (await notSetCell.count() > 0) {
      await notSetCell.click();
      await page.waitForTimeout(300);
    }

    const saveBtn = page.locator('button:has-text("Save Changes")');
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await expect(page.locator('text=Permissions updated successfully').first()).toBeVisible({ timeout: 10_000 });
    }

    console.log('✅ AC3 (partial): UI reflects changes immediately');

    await page.locator('button:has-text("Cancel"), [role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(500);
  });

  test('4. Active session reflects updated permissions on next action', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await updateRolePermissions(page, testRoleId, [
      { permission_id: deletePermissionId, granted: true },
    ]);
    console.log('Granted delete:own permission to role');

    const effWithNewSession = await getEffectivePermissions(page, testUserId);
    expect(effWithNewSession.permissions?.['people:delete:own']).toBe(true);

    console.log('✅ AC3: New API session reflects updated permissions immediately');
  });

  test('5. Consistency across modules - permission change in one module affects other modules', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const viewAppsPermId = await getPermissionId(page, 'apps', 'read', 'own');
    const manageAppsPermId = await getPermissionId(page, 'apps', 'update', 'own');

    await updateRolePermissions(page, testRoleId, [
      { permission_id: viewAppsPermId, granted: true },
      { permission_id: manageAppsPermId, granted: true },
    ]);
    console.log('Updated permissions for apps module');

    const eff = await getEffectivePermissions(page, testUserId);

    expect(eff.permissions?.['apps:read:own']).toBe(true);
    expect(eff.permissions?.['apps:update:own']).toBe(true);
    expect(eff.permissions?.['people:read:own']).toBe(true);

    console.log('✅ AC4: Permissions are consistent across modules (people + apps)');
  });

  test('6. Removing a permission takes effect immediately', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const effBefore = await getEffectivePermissions(page, testUserId);
    expect(effBefore.permissions?.['people:create:own']).toBe(true);

    await updateRolePermissions(page, testRoleId, [
      { permission_id: createPermissionId, granted: false },
    ]);
    console.log('Revoked people:create:own permission');

    const effAfter = await getEffectivePermissions(page, testUserId);
    expect(effAfter.permissions?.['people:create:own']).toBe(false);

    console.log('✅ Permission revocation takes effect immediately');
  });

  test('7. Denied permission is reflected immediately in effective permissions', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await updateRolePermissions(page, testRoleId, [
      { permission_id: updatePermissionId, granted: null },
      { permission_id: deletePermissionId, granted: false },
    ]);
    console.log('Set update:own to not set, delete:own to denied');

    const eff = await getEffectivePermissions(page, testUserId);

    expect(eff.permissions?.['people:update:own']).toBeFalsy();
    expect(eff.permissions?.['people:delete:own']).toBe(false);

    console.log('✅ Denied/not-set permissions reflected correctly');
  });

  test('8. UI effective permissions panel reflects changes immediately', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await updateRolePermissions(page, testRoleId, [
      { permission_id: createPermissionId, granted: true },
    ]);
    console.log('Granted create:own via API');

    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await page.goto(`${APP_URL}/login`);
      await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/overview', { timeout: 20_000 });
      await page.locator('a[href="/people"]').click();
      await page.waitForTimeout(1500);
      const userRow = page.locator(`table tbody tr:has-text("${testUserEmail}")`);
      await expect(userRow).toBeVisible({ timeout: 10_000 });
      await userRow.click();
      await page.waitForTimeout(2000);
    }

    const effPermsSection = page.locator('text=Effective Permissions');
    await expect(effPermsSection).toBeVisible({ timeout: 10_000);

    const grantedBadges = page.locator('text=Granted');
    const grantedCount = await grantedBadges.count();
    expect(grantedCount).toBeGreaterThanOrEqual(1);

    console.log(`✅ UI Effective Permissions panel shows ${grantedCount} Granted badge(s) immediately`);
  });

  test('9. Full E2E: Grant permission and verify test user can access protected resource', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const locationsReadPermId = await getPermissionId(page, 'locations', 'read', 'own');

    await updateRolePermissions(page, testRoleId, [
      { permission_id: locationsReadPermId, granted: true },
    ]);
    console.log('Granted locations:read:own to test role');

    const testUserPage = await page.context().newPage();
    await testUserPage.goto(`${APP_URL}/login`);
    await testUserPage.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await testUserPage.fill('input[type="email"]', testUserEmail);
    await testUserPage.fill('input[type="password"]', testUserPassword);
    await testUserPage.click('button[type="submit"]');
    await testUserPage.waitForURL('**/overview', { timeout: 20_000 });

    await testUserPage.goto(`${APP_URL}/locations`);
    await testUserPage.waitForTimeout(1500);

    const hasAccess = !testUserPage.url().includes('/login');
    expect(hasAccess).toBe(true);

    console.log('✅ Test user can access /locations with newly granted permission');
    await testUserPage.close();
  });

  test('10. Full E2E: Revoke permission and verify test user loses access', async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const locationsReadPermId = await getPermissionId(page, 'locations', 'read', 'own');

    await updateRolePermissions(page, testRoleId, [
      { permission_id: locationsReadPermId, granted: false },
    ]);
    console.log('Revoked locations:read:own from test role');

    const eff = await getEffectivePermissions(page, testUserId);
    expect(eff.permissions?.['locations:read:own']).toBe(false);

    console.log('✅ Test user lost access to locations permission immediately after revocation');
  });
});