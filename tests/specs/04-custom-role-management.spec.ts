// tests/specs/04-custom-role-management.spec.ts
// Tests custom role CRUD: create from scratch, duplicate from template,
// independent modification, and template isolation.
import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
// The app stores auth in an in-memory Zustand store, which Playwright's
// storageState cannot capture.  Additionally, server-side requireAuth
// middleware checks Authorization: Bearer <token>, so every API call via
// page.request.fetch must include the token.
//
// Strategy:
//   1) Obtain a short-lived access token via the login API (no UI needed).
//   2) Cache it module-scoped and attach it to every api() call.
//   3) For UI-level tests, detect redirects to /login and perform a full
//      UI-based login to populate the in-memory Zustand store.

const TEST_EMAIL = 'tsaleem@abidisolutions.com';
const TEST_PASSWORD = 'Mtayyab595*';

let cachedToken: string | null = null;

/** Obtain (and cache) an access token via the auth API. */
async function getAccessToken(page: Page): Promise<string> {
  if (cachedToken) return cachedToken;

  console.log('🔑 Acquiring access token via API...');
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  const body = await resp.json();

  if (!body.success || !body.data?.accessToken) {
    throw new Error(
      `Login API failed: ${resp.status()} ${JSON.stringify(body)}`,
    );
  }

  cachedToken = body.data.accessToken;
  console.log(`✅ Access token acquired (${cachedToken.slice(0, 12)}…).`);
  return cachedToken;
}

/**
 * Authenticated API helper.
 * Attaches the Bearer token obtained via getAccessToken() to every request.
 */
async function api(page: Page, method: string, path: string, body?: any) {
  const token = await getAccessToken(page);
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

/**
 * Navigate to the given app path, handling the AuthGuard redirect.
 *
 * Because the app's AuthGuard checks an in-memory Zustand store that is
 * empty when a fresh Playwright context is created (storageState cannot
 * capture JavaScript heap state), the first navigation to any protected
 * route will redirect to /login.  This function detects the redirect and
 * performs a full browser-based login to populate the Zustand store.
 */
async function ensureAuthenticated(page: Page, path: string = '/roles') {
  const targetUrl = `${APP_URL}${path}`;
  console.log(`📍 Navigating to ${targetUrl}...`);
  await page.goto(targetUrl);
  await page.waitForTimeout(1000);

  const currentUrl = page.url();
  console.log(`📍 Current URL after goto: ${currentUrl}`);

  if (currentUrl.includes('/login')) {
    console.log('🔄 Redirected to /login — performing fallback UI login...');
    await page.goto(`${APP_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/overview', { timeout: 20_000 });
    console.log(`✅ UI login succeeded. URL: ${page.url()}`);

    // Navigate to the requested path
    await page.goto(targetUrl);
    await page.waitForTimeout(1000);
    console.log(`📍 Final URL: ${page.url()}`);
  } else {
    console.log('✅ Auth guard passed — no redirect to login.');
  }
}

// ---------------------------------------------------------------------------
// Role API helpers
// ---------------------------------------------------------------------------

async function getPermissionId(
  page: Page,
  module: string,
  action: string,
  scope: string,
): Promise<string> {
  const perms = await api(page, 'GET', '/roles/permissions/all');
  const found = (perms.data || []).find(
    (p: any) =>
      p.module === module && p.action === action && p.data_scope === scope,
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

async function createRole(
  page: Page,
  name: string,
  description?: string,
  templateRoleId?: string,
) {
  const body: any = { name, description, type: 'custom' };
  if (templateRoleId) body.template_role_id = templateRoleId;
  const resp = await api(page, 'POST', '/roles', body);
  if (resp.status === 201 || resp.success) return resp.data;
  const roleId = await getRoleId(page, name);
  return { _id: roleId, name };
}

async function deleteRole(page: Page, roleId: string) {
  return api(page, 'DELETE', `/roles/${roleId}`);
}

async function updateRole(
  page: Page,
  roleId: string,
  data: { name?: string; description?: string },
) {
  return api(page, 'PUT', `/roles/${roleId}`, data);
}

async function updateRolePermissions(
  page: Page,
  roleId: string,
  permissions: Array<{ permission_id: string; granted: boolean | null }>,
) {
  return api(page, 'PUT', `/roles/${roleId}/permissions`, { permissions });
}

// ---------------------------------------------------------------------------
// Debug helper — logs auth cookies and localStorage state
// ---------------------------------------------------------------------------
async function logAuthDebugInfo(page: Page) {
  const cookies = await page.context().cookies();
  console.log('🍪 Cookies:', cookies.map((c) => `${c.name} (${c.path})`));
  const ls = await page.evaluate(() => {
    try {
      const stored = localStorage.getItem('playwright_auth');
      return stored ? 'playwright_auth present' : 'no playwright_auth';
    } catch {
      return 'localStorage not available';
    }
  });
  console.log(`🗄️ localStorage: ${ls}`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Custom Role Management - 10 tests', () => {
  const createdRoleIds: string[] = [];

  test.beforeAll(async ({ page }) => {
    // Warm up the token cache
    await getAccessToken(page);
    console.log('🔑 Token cache primed for all tests.');
  });

  test.beforeEach(async ({ page }) => {
    await logAuthDebugInfo(page);
  });

  test.afterEach(async ({ page }) => {
    for (const roleId of createdRoleIds) {
      try {
        await deleteRole(page, roleId);
        console.log(`🧹 Deleted role ${roleId}`);
      } catch {
        // Role may already be deleted or have dependents
      }
    }
    createdRoleIds.length = 0;
  });

  // ── AC-1: Create role from scratch ─────────────────────────────────────

  test('1. Admin can create a custom role from scratch', async ({ page }) => {
    const name = `Scratch-Role-${Date.now()}`;
    const role = await createRole(page, name, 'Created from scratch');
    createdRoleIds.push(role._id);

    expect(role).toBeDefined();
    expect(role._id).toBeTruthy();
    expect(role.name).toBe(name);
    expect(role.type).toBe('custom');
    console.log(`✅ Created role: ${name} (${role._id})`);
  });

  test('2. Newly created custom role appears in the roles list', async ({ page }) => {
    const name = `List-Role-${Date.now()}`;
    const role = await createRole(page, name, 'Should appear in list');
    createdRoleIds.push(role._id);

    const rolesResp = await api(page, 'GET', '/roles');
    const names = (rolesResp.data || []).map((r: any) => r.name);
    expect(names).toContain(name);
    console.log(`✅ Role "${name}" found in API roles list.`);
  });

  test('3. Newly created role appears in the UI roles table', async ({ page }) => {
    // Ensure the UI page is authenticated first
    await ensureAuthenticated(page, '/roles');

    const name = `UI-Role-${Date.now()}`;
    const role = await createRole(page, name, 'UI visibility test');
    createdRoleIds.push(role._id);

    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1500);

    const roleRow = page.locator(`table tbody tr:has-text("${name}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    console.log(`✅ Role "${name}" visible in UI table.`);
  });

  test('4. Created custom role has zero permissions by default', async ({ page }) => {
    const name = `Empty-Role-${Date.now()}`;
    const role = await createRole(page, name, 'Zero permissions');
    createdRoleIds.push(role._id);

    const perms = await getRolePermissions(page, role._id);
    expect(Array.isArray(perms)).toBe(true);
    expect(perms.length).toBe(0);
    console.log(`✅ Role "${name}" has ${perms.length} permissions (expected 0).`);
  });

  // ── AC-2: Duplicate an existing role ───────────────────────────────────

  test('5. Admin can duplicate an existing role as a template', async ({ page }) => {
    const templateName = 'Viewer';
    const templateId = await getRoleId(page, templateName);
    const templatePerms = await getRolePermissions(page, templateId);

    const dupName = `Dup-From-${templateName}-${Date.now()}`;
    const duplicated = await createRole(
      page,
      dupName,
      `Duplicated from ${templateName}`,
      templateId,
    );
    createdRoleIds.push(duplicated._id);

    expect(duplicated).toBeDefined();
    expect(duplicated._id).toBeTruthy();

    const dupPerms = await getRolePermissions(page, duplicated._id);
    expect(dupPerms.length).toBe(templatePerms.length);
    console.log(
      `✅ Duplicated "${templateName}" → "${dupName}" with ${dupPerms.length} permissions.`,
    );
  });

  test('6. Duplicated role has same permissions as the template', async ({ page }) => {
    const templateName = 'Employee';
    const templateId = await getRoleId(page, templateName);
    const templatePerms = await getRolePermissions(page, templateId);

    const dupName = `Emp-Dup-${Date.now()}`;
    const duplicated = await createRole(
      page,
      dupName,
      'Duplicated from Employee',
      templateId,
    );
    createdRoleIds.push(duplicated._id);

    const dupPerms = await getRolePermissions(page, duplicated._id);

    const templateMap = new Map(
      templatePerms.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );
    const dupMap = new Map(
      dupPerms.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );

    expect(dupMap.size).toBe(templateMap.size);
    for (const [key, granted] of templateMap) {
      expect(dupMap.get(key)).toBe(granted);
    }
    console.log(`✅ Duplicated role has identical ${dupMap.size} permissions.`);
  });

  // ── AC-3: Modify duplicated role independently ─────────────────────────

  test('7. Modifying the duplicated role does not affect the template', async ({ page }) => {
    const templateName = 'Viewer';
    const templateId = await getRoleId(page, templateName);

    // Capture template baseline
    const templatePermsBefore = await getRolePermissions(page, templateId);
    const templateBeforeMap = new Map(
      templatePermsBefore.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );
    const peopleReadOwnBefore = templateBeforeMap.get('people:read:own');

    // Duplicate
    const dupName = `Indep-Test-${Date.now()}`;
    const duplicated = await createRole(
      page,
      dupName,
      'Independence test',
      templateId,
    );
    createdRoleIds.push(duplicated._id);

    // Grant people:read:own on the duplicate
    const permId = await getPermissionId(page, 'people', 'read', 'own');
    await updateRolePermissions(page, duplicated._id, [
      { permission_id: permId, granted: true },
    ]);

    // Verify duplicate changed
    const dupPermsAfter = await getRolePermissions(page, duplicated._id);
    const dupAfterMap = new Map(
      dupPermsAfter.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );
    expect(dupAfterMap.get('people:read:own')).toBe(true);

    // Verify template unchanged
    const templatePermsAfter = await getRolePermissions(page, templateId);
    const templateAfterMap = new Map(
      templatePermsAfter.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );
    expect(templateAfterMap.get('people:read:own')).toBe(peopleReadOwnBefore);
    console.log(
      `✅ Duplicate modified independently; template "${templateName}" unchanged.`,
    );
  });

  // ── AC-4: Template unchanged after duplication ─────────────────────────

  test('8. Original template role permissions remain intact after multiple duplications', async ({ page }) => {
    const templateName = 'Manager';
    const templateId = await getRoleId(page, templateName);

    const templatePermsBefore = await getRolePermissions(page, templateId);
    const templateSnapshot = new Map(
      templatePermsBefore.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );

    for (let i = 0; i < 3; i++) {
      const dupName = `MultiDup-${i}-${Date.now()}`;
      const dup = await createRole(
        page,
        dupName,
        `Duplicate ${i}`,
        templateId,
      );
      createdRoleIds.push(dup._id);
    }

    const templatePermsAfter = await getRolePermissions(page, templateId);
    const templateAfterMap = new Map(
      templatePermsAfter.map((p: any) => [`${p.module}:${p.action}:${p.data_scope}`, p.granted]),
    );
    expect(templateAfterMap.size).toBe(templateSnapshot.size);
    for (const [key, granted] of templateSnapshot) {
      expect(templateAfterMap.get(key)).toBe(granted);
    }
    console.log(`✅ Template "${templateName}" unchanged after 3 duplications.`);
  });

  test('9. Duplicated role can be renamed independently without affecting template', async ({ page }) => {
    const templateName = 'HR';
    const templateId = await getRoleId(page, templateName);

    const templateBefore = await api(page, 'GET', `/roles/${templateId}`);
    const originalTemplateName = templateBefore.data?.name;

    const dupName = `Rename-Dup-${Date.now()}`;
    const duplicated = await createRole(
      page,
      dupName,
      'Will be renamed',
      templateId,
    );
    createdRoleIds.push(duplicated._id);

    const newName = `Renamed-${Date.now()}`;
    const updateResp = await updateRole(page, duplicated._id, { name: newName });
    expect(updateResp.success).toBe(true);

    const dupAfter = await api(page, 'GET', `/roles/${duplicated._id}`);
    expect(dupAfter.data.name).toBe(newName);

    const templateAfter = await api(page, 'GET', `/roles/${templateId}`);
    expect(templateAfter.data.name).toBe(originalTemplateName);
    console.log(
      `✅ Duplicate renamed "${dupName}" → "${newName}"; template "${originalTemplateName}" unchanged.`,
    );
  });

  // ── Full UI end-to-end workflow ────────────────────────────────────────

  test('10. Full UI workflow: create role, duplicate it, verify independence in UI', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Create a base role and grant it one permission
    const baseName = `Base-Role-${Date.now()}`;
    const baseRole = await createRole(page, baseName, 'Base role for E2E');
    createdRoleIds.push(baseRole._id);

    const permId = await getPermissionId(page, 'people', 'read', 'own');
    await updateRolePermissions(page, baseRole._id, [
      { permission_id: permId, granted: true },
    ]);

    // Re-navigate so the UI table reflects the new role
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1500);

    // Verify base role is visible in the table
    const baseRow = page.locator(`table tbody tr:has-text("${baseName}")`);
    await expect(baseRow).toBeVisible({ timeout: 10_000 });

    // Click the duplicate button
    const duplicateBtn = baseRow.locator('button[title="Duplicate Role"]');
    await expect(duplicateBtn).toBeVisible({ timeout: 5_000 });
    await duplicateBtn.click();
    await page.waitForTimeout(500);

    // Verify the modal pre-fills the name as "{baseName} (Copy)"
    const nameInput = page.locator('input[placeholder="e.g. Finance Manager"]');
    await expect(nameInput).toBeVisible({ timeout: 5_000 });
    const inputValue = await nameInput.inputValue();
    expect(inputValue).toBe(`${baseName} (Copy)`);

    // Submit the duplicate form
    const createBtn = page.locator('button:has-text("Create Duplicate")');
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await page.waitForTimeout(1500);

    // Re-navigate to see the new role in the table
    await page.goto(`${APP_URL}/roles`);
    await page.waitForTimeout(1500);

    const dupName = `${baseName} (Copy)`;
    const dupRow = page.locator(`table tbody tr:has-text("${dupName}")`);
    await expect(dupRow).toBeVisible({ timeout: 10_000 });

    // Verify the original role still exists
    const baseRowAfter = page.locator(`table tbody tr:has-text("${baseName}")`);
    await expect(baseRowAfter).toBeVisible({ timeout: 5_000 });

    // Track the duplicate for teardown
    try {
      const dupRoleId = await getRoleId(page, dupName);
      createdRoleIds.push(dupRoleId);
    } catch {
      console.warn('⚠️ Could not resolve duplicate role ID for cleanup.');
    }

    console.log('✅ Full UI workflow completed successfully.');
  });
});
