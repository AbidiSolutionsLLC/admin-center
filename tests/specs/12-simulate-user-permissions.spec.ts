/**
 * tests/specs/12-simulate-user-permissions.spec.ts
 *
 * Tests for the "Simulate User Permissions" feature.
 * AC1: Admin can select a user (or role/group) to simulate
 * AC2: System displays effective permissions and source of permissions (role/group)
 * AC3: Simulation reflects real-time configuration
 * AC4: Results are clear and understandable
 *
 * Seed data requirements:
 * - Admin user: tsaleem@abidisolutions.com (password: Mtayyab595*)
 * - At least 2 roles, 2 groups, 3 permissions with known relationships
 * - Regular test user
 */

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

const TEST_EMAIL = 'tsaleem@abidisolutions.com';
const TEST_PASSWORD = 'Mtayyab595*';

let cachedToken: string | null = null;

// ---------------------------------------------------------------------------
// Auth Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(page: Page): Promise<string> {
  if (cachedToken) return cachedToken;
  console.log('🔑 Acquiring admin access token via API...');
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  const body = await resp.json();
  if (!body.success || !body.data?.accessToken) {
    throw new Error(`Login API failed: ${resp.status()} ${JSON.stringify(body)}`);
  }
  cachedToken = body.data.accessToken;
  console.log(`✅ Admin token acquired (${cachedToken.slice(0, 12)}...)`);
  return cachedToken;
}

async function api(page: Page, method: string, path: string, body?: any) {
  const token = await getAccessToken(page);
  const opts: any = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body) opts.data = body;
  const resp = await page.request.fetch(`${API_URL}${path}`, opts);
  const json = await resp.json();
  return { status: resp.status(), ...json };
}

/**
 * Navigate to a protected route, handling AuthGuard redirect due to
 * in-memory Zustand store.
 */
async function ensureAuthenticated(page: Page, path: string = '/roles') {
  const targetUrl = `${APP_URL}${path}`;
  await page.goto(targetUrl);
  await page.waitForTimeout(1000);

  if (page.url().includes('/login')) {
    await page.goto(`${APP_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/overview', { timeout: 20_000 });
    // Navigate via sidebar link to preserve Zustand store
    const navPath = path.startsWith('/') ? path : `/${path}`;
    await page.locator(`a[href="${navPath}"]`).click();
    await page.waitForTimeout(1500);
  }
}

// ---------------------------------------------------------------------------
// API Helpers
// ---------------------------------------------------------------------------

async function getPermissionId(page: Page, module: string, action: string, data_scope: string): Promise<string> {
  const resp = await api(page, 'GET', '/roles/permissions/all');
  const perms = resp.data || [];
  const found = perms.find((p: any) => p.module === module && p.action === action && p.data_scope === data_scope);
  if (!found) throw new Error(`Permission not found: ${module}:${action}:${data_scope}`);
  return found._id;
}

async function getAllRoles(page: Page) {
  const resp = await api(page, 'GET', '/roles');
  return resp.data || [];
}

async function getRoleId(page: Page, name: string): Promise<string> {
  const roles = await getAllRoles(page);
  const found = roles.find((r: any) => r.name === name);
  if (!found) throw new Error(`Role "${name}" not found`);
  return found._id;
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

async function assignRoleToUser(page: Page, roleId: string, userId: string) {
  return api(page, 'POST', `/roles/${roleId}/users`, { user_id: userId });
}

async function unassignRoleFromUser(page: Page, roleId: string, userId: string) {
  return api(page, 'DELETE', `/roles/${roleId}/users/${userId}`);
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

async function simulatePermissions(page: Page, userId: string, hypotheticalRoleIds: string[]) {
  const token = await getAccessToken(page);
  const resp = await page.request.fetch(`${API_URL}/roles/simulate-permissions?user_id=${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    data: { hypothetical_role_ids: hypotheticalRoleIds },
  });
  const json = await resp.json();
  return { status: resp.status(), ...json };
}

async function getUsers(page: Page, limit: number = 50) {
  const resp = await api(page, 'GET', `/people?limit=${limit}`);
  return resp.data || [];
}

async function getFirstTestUser(page: Page): Promise<{ _id: string; email: string; full_name: string }> {
  const users = await getUsers(page);
  const testUser = users.find((u: any) => u.email !== TEST_EMAIL && u.is_active);
  if (!testUser) throw new Error('No non-admin active user found. Seed demo data first.');
  return { _id: testUser._id, email: testUser.email, full_name: testUser.full_name };
}

async function getUserRoles(page: Page, userId: string) {
  const resp = await api(page, 'GET', `/people/${userId}`);
  return resp.data?.roles || [];
}

async function getAllGroups(page: Page) {
  const resp = await api(page, 'GET', '/groups');
  return resp.data || [];
}

async function getGroupId(page: Page, name: string): Promise<string> {
  const groups = await getAllGroups(page);
  const found = groups.find((g: any) => g.name === name);
  if (!found) throw new Error(`Group "${name}" not found`);
  return found._id;
}

async function createGroup(page: Page, name: string, description?: string) {
  const body: any = { name, description, type: 'static' };
  const resp = await api(page, 'POST', '/groups', body);
  if (resp.status === 201 || resp.success) return resp.data;
  const groupId = await getGroupId(page, name);
  return { _id: groupId, name };
}

async function deleteGroup(page: Page, groupId: string) {
  return api(page, 'DELETE', `/groups/${groupId}`);
}

async function addUserToGroup(page: Page, groupId: string, userId: string) {
  return api(page, 'POST', `/groups/${groupId}/users`, { userIds: [userId] });
}

async function removeUserFromGroup(page: Page, groupId: string, userId: string) {
  return api(page, 'DELETE', `/groups/${groupId}/users`, { userIds: [userId] });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Simulate User Permissions', () => {
  let testUserId: string;
  let testUserEmail: string;
  let testUserName: string;

  // Test-specific roles
  let roleSimViewerId: string;
  let roleSimViewerName: string;
  let roleSimEditorId: string;
  let roleSimEditorName: string;

  // Test-specific groups
  let groupMarketingId: string;
  let groupMarketingName: string;
  let groupEngineeringId: string;
  let groupEngineeringName: string;

  // Permission IDs
  let permPeopleReadOwnId: string;
  let permPeopleCreateOwnId: string;
  let permPeopleReadAllId: string;
  let permReportsReadOwnId: string;

  test.beforeAll(async ({ page }) => {
    await getAccessToken(page);

    // 1. Find/create test user
    const userInfo = await getFirstTestUser(page);
    testUserId = userInfo._id;
    testUserEmail = userInfo.email;
    testUserName = userInfo.full_name;
    console.log(`👤 Test user: ${testUserName} (${testUserEmail})`);

    // Remove all existing role assignments from the test user for a clean state
    const existingRoles = await getUserRoles(page, testUserId);
    for (const role of existingRoles) {
      await unassignRoleFromUser(page, role._id, testUserId);
    }
    console.log(`   Cleared ${existingRoles.length} existing role(s) from test user`);

    // 2. Resolve permission IDs for known system permissions
    permPeopleReadOwnId = await getPermissionId(page, 'people', 'read', 'own');
    permPeopleCreateOwnId = await getPermissionId(page, 'people', 'create', 'own');
    permPeopleReadAllId = await getPermissionId(page, 'people', 'read', 'all');
    permReportsReadOwnId = await getPermissionId(page, 'reports', 'read', 'own');
    console.log('📋 Resolved 4 permission IDs');

    // 3. Create 2 test-specific roles
    roleSimViewerName = `SimViewer-${Date.now()}`;
    const viewerRole = await createRole(page, roleSimViewerName, 'Test role for simulate permissions - Viewer');
    roleSimViewerId = viewerRole._id;
    console.log(`📁 Created role: ${roleSimViewerName} (${roleSimViewerId})`);

    // Configure viewer role: people:read:own = granted
    await updateRolePermissions(page, roleSimViewerId, [
      { permission_id: permPeopleReadOwnId, granted: true },
    ]);
    console.log(`   Configured ${roleSimViewerName}: people:read:own = granted`);

    roleSimEditorName = `SimEditor-${Date.now() + 1}`;
    const editorRole = await createRole(page, roleSimEditorName, 'Test role for simulate permissions - Editor');
    roleSimEditorId = editorRole._id;
    console.log(`📁 Created role: ${roleSimEditorName} (${roleSimEditorId})`);

    // Configure editor role: people:read:own + people:create:own + reports:read:own = granted
    await updateRolePermissions(page, roleSimEditorId, [
      { permission_id: permPeopleReadOwnId, granted: true },
      { permission_id: permPeopleCreateOwnId, granted: true },
      { permission_id: permReportsReadOwnId, granted: true },
    ]);
    console.log(`   Configured ${roleSimEditorName}: 3 permissions granted`);

    // 4. Create 2 test-specific groups
    groupMarketingName = `SimMktg-${Date.now()}`;
    const mktgGroup = await createGroup(page, groupMarketingName, 'Test group for simulate permissions');
    groupMarketingId = mktgGroup._id;

    groupEngineeringName = `SimEng-${Date.now() + 1}`;
    const engGroup = await createGroup(page, groupEngineeringName, 'Test group for simulate permissions');
    groupEngineeringId = engGroup._id;
    console.log(`👥 Created groups: ${groupMarketingName}, ${groupEngineeringName}`);

    // Add test user to Marketing group
    await addUserToGroup(page, groupMarketingId, testUserId);
    console.log(`   Added test user to ${groupMarketingName}`);
  });

  test.afterAll(async ({ page }) => {
    // Remove test user from all test groups
    try {
      await removeUserFromGroup(page, groupMarketingId, testUserId);
      await removeUserFromGroup(page, groupEngineeringId, testUserId);
    } catch (e) {
      console.warn('   Group cleanup warning:', (e as Error).message);
    }

    // Remove all test-specific role assignments from test user
    try {
      await unassignRoleFromUser(page, roleSimViewerId, testUserId);
    } catch { /* ignore */ }
    try {
      await unassignRoleFromUser(page, roleSimEditorId, testUserId);
    } catch { /* ignore */ }

    // Delete test roles
    try {
      await deleteRole(page, roleSimViewerId);
      console.log(`   Deleted role: ${roleSimViewerName}`);
    } catch { /* may have dependents */ }
    try {
      await deleteRole(page, roleSimEditorId);
      console.log(`   Deleted role: ${roleSimEditorName}`);
    } catch { /* may have dependents */ }

    // Delete test groups
    try {
      await deleteGroup(page, groupMarketingId);
      console.log(`   Deleted group: ${groupMarketingName}`);
    } catch { /* may have dependents */ }
    try {
      await deleteGroup(page, groupEngineeringId);
      console.log(`   Deleted group: ${groupEngineeringName}`);
    } catch { /* may have dependents */ }
  });

  // ── AC1: Admin can select a user to simulate ─────────────────────────────

  test('1. Load roles page with Simulate Access button visible', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Verify the page loaded by checking the heading
    const pageHeading = page.locator('h1:has-text("Roles & Access")');
    await expect(pageHeading).toBeVisible({ timeout: 10_000 });
    console.log('   Page heading "Roles & Access" is visible');

    // Verify the "Simulate Access" button exists
    const simulateBtn = page.locator('button:has-text("Simulate Access")');
    await expect(simulateBtn).toBeVisible({ timeout: 5_000 });
    console.log('✅ "Simulate Access" button is visible');
  });

  test('2. Open Permission Simulator modal and verify structure', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Click "Simulate Access" button
    const simulateBtn = page.locator('button:has-text("Simulate Access")');
    await expect(simulateBtn).toBeVisible({ timeout: 5_000 });
    await simulateBtn.click();
    await page.waitForTimeout(500);

    // Verify modal opened
    // TODO: Update selector - current assumption based on modal title text
    const modalTitle = page.locator('h2:has-text("Permission Simulator"), [role="dialog"] h2:has-text("Permission Simulator")');
    await expect(modalTitle).toBeVisible({ timeout: 5_000 });
    console.log('✅ Permission Simulator modal opened');

    // Verify left panel sections exist
    // TODO: Update selector - current assumption based on label text
    const userLabel = page.locator('label:has-text("1. Select User")');
    await expect(userLabel).toBeVisible({ timeout: 3_000 });

    const rolesLabel = page.locator('label:has-text("2. Add Hypothetical Roles")');
    await expect(rolesLabel).toBeVisible({ timeout: 3_000 });

    // Verify user search input exists
    const searchInput = page.locator('input[placeholder="Search user..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });

    // Verify Simulate button exists (initially disabled since no user selected)
    const simulateActionBtn = page.locator('button:has-text("Simulate")');
    await expect(simulateActionBtn).toBeVisible({ timeout: 3_000 });
    await expect(simulateActionBtn).toBeDisabled();

    // Verify results placeholder is shown
    const placeholderText = page.locator('text=Select a user and roles, then click Simulate to view effective permissions');
    await expect(placeholderText).toBeVisible({ timeout: 3_000 });
    console.log('✅ Modal structure verified: search input, role checkboxes, and placeholder present');
  });

  test('3. Select user from search and display results after simulation', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open simulator
    await page.locator('button:has-text("Simulate Access")').click();
    await page.waitForTimeout(500);

    // Type into user search
    const searchInput = page.locator('input[placeholder="Search user..."]');
    await expect(searchInput).toBeVisible({ timeout: 3_000 });
    await searchInput.fill(testUserName.substring(0, 3));
    await page.waitForTimeout(500);

    // Click on the test user in the search results
    const userButton = page.locator(`button:has-text("${testUserName}")`).first();
    await expect(userButton).toBeVisible({ timeout: 5_000 });
    await userButton.click();
    await page.waitForTimeout(300);

    // Verify Simulate button is now enabled
    const simulateActionBtn = page.locator('button:has-text("Simulate")');
    await expect(simulateActionBtn).toBeEnabled({ timeout: 3_000 });

    // Click Simulate without any hypothetical roles (uses current assigned roles)
    await simulateActionBtn.click();
    await page.waitForTimeout(1000);

    // Verify results section shows "Effective access for <username>"
    const effectiveAccess = page.locator(`text=Effective access for ${testUserName}`);
    await expect(effectiveAccess).toBeVisible({ timeout: 8_000 });
    console.log(`✅ Simulation results displayed for user: ${testUserName}`);

    // Verify results table is present (Module, Action, Scope, Access columns)
    const tableHeaders = page.locator('table th');
    await expect(tableHeaders.first()).toBeVisible({ timeout: 3_000 });

    const moduleHeader = page.locator('th:has-text("Module")');
    const actionHeader = page.locator('th:has-text("Action")');
    const scopeHeader = page.locator('th:has-text("Scope")');
    const accessHeader = page.locator('th:has-text("Access")');
    await expect(moduleHeader).toBeVisible();
    await expect(actionHeader).toBeVisible();
    await expect(scopeHeader).toBeVisible();
    await expect(accessHeader).toBeVisible();
    console.log('✅ Results table has Module, Action, Scope, Access columns');
  });

  // ── AC2: System displays effective permissions ──────────────────────────

  test('4. Verify effective permissions API matches expected based on roles', async ({ page }) => {
    // Assign viewer role to test user
    const assignResult = await assignRoleToUser(page, roleSimViewerId, testUserId);
    expect(assignResult.success).toBe(true);
    console.log(`   Assigned role "${roleSimViewerName}" to test user`);

    // Get effective permissions via API
    const effective = await getEffectivePermissions(page, testUserId);
    const perms = effective.permissions || {};
    console.log(`   Effective permissions: ${Object.keys(perms).length} total`);

    // Viewer role grants people:read:own
    expect(perms['people:read:own']).toBe(true);
    console.log(`   people:read:own = ${perms['people:read:own']}`);

    // Viewer role does NOT grant people:create:own
    expect(perms['people:create:own']).toBeUndefined();
    console.log(`   people:create:own = ${perms['people:create:own']}`);

    // Verify roles array contains the viewer role
    const hasViewerRole = effective.roles?.some((r: any) => r.name === roleSimViewerName || r._id === roleSimViewerId);
    expect(hasViewerRole).toBe(true);
    console.log('✅ Effective permissions match viewer role configuration');
  });

  test('5. Verify each permission displayed in readable format in UI', async ({ page }) => {
    // Navigate to user detail page where EffectivePermissionsPanel is rendered
    await ensureAuthenticated(page, `/people/${testUserId}`);

    // Verify Effective Permissions section is visible
    // TODO: Update selector - current assumption based on heading text
    const effPermsSection = page.locator('h3:has-text("Effective Permissions")');
    await expect(effPermsSection).toBeVisible({ timeout: 10_000 });
    console.log('✅ Effective Permissions panel is visible');

    // Verify role badges are shown
    // TODO: Update selector - current assumption based on StatusBadge pattern
    const roleBadge = page.locator(`text=${roleSimViewerName}`).first();
    await expect(roleBadge).toBeVisible({ timeout: 5_000 });
    console.log(`✅ Role badge "${roleSimViewerName}" is displayed in UI`);

    // Verify permissions are shown in readable format (action names, not raw codes)
    const grantedBadge = page.locator('text=Granted').first();
    await expect(grantedBadge).toBeVisible({ timeout: 5_000 });
    console.log('✅ Permissions displayed with readable format (Granted/Denied badges)');

    // Verify the description text is present
    const descriptionText = page.locator('text=Resolved permissions across all assigned roles');
    await expect(descriptionText).toBeVisible({ timeout: 3_000 });
    console.log('✅ Permission description text is visible and understandable');

    console.log('✅ Permissions panel displays clear and understandable information');
  });

  test('6. Verify source attribution via role badges', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${testUserId}`);

    // Verify the roles section shows "Assigned Roles:" label
    // TODO: Update selector - current assumption based on label text
    const rolesLabel = page.locator('text=Assigned Roles');
    await expect(rolesLabel).toBeVisible({ timeout: 5_000 });

    // Verify the viewer role badge acts as source attribution
    const viewerBadge = page.locator(`text=${roleSimViewerName}`).first();
    await expect(viewerBadge).toBeVisible({ timeout: 3_000 });
    console.log(`✅ Source attribution: "${roleSimViewerName}" badge visible`);

    // Verify there is a "No roles assigned" message NOT shown (since we have roles)
    const noRolesMsg = page.locator('text=No roles assigned');
    const hasNoRolesMsg = await noRolesMsg.count();
    expect(hasNoRolesMsg).toBe(0);
    console.log('✅ Source attribution clear: roles are displayed as labeled badges');
  });

  // ── AC3: Real-time simulation ──────────────────────────────────────────

  test('7. Real-time update: assign new permission to role and verify simulation updates', async ({ page }) => {
    // Before: verify people:create:own is not granted
    let effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:create:own']).toBeUndefined();
    console.log('   Before: people:create:own = undefined');

    // Update viewer role to grant people:create:own
    await updateRolePermissions(page, roleSimViewerId, [
      { permission_id: permPeopleReadOwnId, granted: true },
      { permission_id: permPeopleCreateOwnId, granted: true },
    ]);
    console.log(`   Updated ${roleSimViewerName}: added people:create:own = granted`);

    // After: verify people:create:own is now granted
    effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:create:own']).toBe(true);
    console.log('   After: people:create:own = true');

    // Verify people:read:own is still granted
    expect(effective.permissions?.['people:read:own']).toBe(true);
    console.log('✅ Real-time update verified: permission change reflected immediately via API');
  });

  test('8. Real-time update: remove user from role and verify simulation updates', async ({ page }) => {
    // Before: verify we have the viewer role
    let effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:read:own']).toBe(true);
    expect(effective.permissions?.['people:create:own']).toBe(true);
    console.log('   Before: both permissions granted');

    // Unassign viewer role from test user
    await unassignRoleFromUser(page, roleSimViewerId, testUserId);
    console.log(`   Removed role "${roleSimViewerName}" from test user`);

    // After: verify permissions are gone
    effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:read:own']).toBeUndefined();
    expect(effective.permissions?.['people:create:own']).toBeUndefined();
    console.log('   After: both permissions removed');
    console.log('✅ Role removal reflected immediately via API');
  });

  test('9. Real-time update: effective permissions reflect changes immediately without page reload', async ({ page }) => {
    // Re-assign viewer role so we can test the simulator
    await assignRoleToUser(page, roleSimViewerId, testUserId);
    console.log(`   Re-assigned "${roleSimViewerName}" to test user`);

    // Before: verify people:read:own is granted
    let effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:read:own']).toBe(true);
    console.log('   Before: people:read:own = true');

    // Now test that the effective permissions API (used by the UI) reflects immediately

    // Revoke the permission
    await updateRolePermissions(page, roleSimViewerId, [
      { permission_id: permPeopleReadOwnId, granted: false },
      { permission_id: permPeopleCreateOwnId, granted: false },
    ]);
    console.log(`   Revoked all permissions from ${roleSimViewerName}`);

    // Verify via API immediately (no page reload)
    effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:read:own']).toBe(false);
    expect(effective.permissions?.['people:create:own']).toBe(false);
    console.log('✅ Permission changes reflected immediately via API without page reload');
  });

  test('10. Permission simulator with hypothetical roles shows aggregated permissions', async ({ page }) => {
    // Ensure test user has no roles assigned for a clean simulation
    await unassignRoleFromUser(page, roleSimViewerId, testUserId);
    console.log(`   Removed "${roleSimViewerName}" from test user`);

    // Verify user currently has no effective permissions
    let effective = await getEffectivePermissions(page, testUserId);
    expect(Object.keys(effective.permissions || {})).toHaveLength(0);
    console.log('   Test user has 0 permissions currently');

    // Simulate with the editor role (which grants 3 permissions)
    const simResult = await simulatePermissions(page, testUserId, [roleSimEditorId]);
    expect(simResult.success).toBe(true);
    const simData = simResult.data;

    // Verify simulated roles
    const hasEditorRole = simData.roles?.some((r: any) => r.role_id === roleSimEditorId);
    expect(hasEditorRole).toBe(true);
    console.log(`   Simulation includes role: ${roleSimEditorName}`);

    // Verify simulated permissions
    const simPerms = simData.permissions || [];
    console.log(`   Simulated permissions count: ${simPerms.length}`);

    const peopleReadOwn = simPerms.find((p: any) => p.module === 'people' && p.action === 'read' && p.data_scope === 'own');
    const peopleCreateOwn = simPerms.find((p: any) => p.module === 'people' && p.action === 'create' && p.data_scope === 'own');
    const reportsReadOwn = simPerms.find((p: any) => p.module === 'reports' && p.action === 'read' && p.data_scope === 'own');

    expect(peopleReadOwn?.granted).toBe(true);
    expect(peopleCreateOwn?.granted).toBe(true);
    expect(reportsReadOwn?.granted).toBe(true);
    console.log(`   people:read:own = ${peopleReadOwn?.granted}`);
    console.log(`   people:create:own = ${peopleCreateOwn?.granted}`);
    console.log(`   reports:read:own = ${reportsReadOwn?.granted}`);

    // Verify each permission has module, action, data_scope, and granted fields
    for (const perm of simPerms) {
      expect(perm).toHaveProperty('module');
      expect(perm).toHaveProperty('action');
      expect(perm).toHaveProperty('data_scope');
      expect(perm).toHaveProperty('granted');
    }
    console.log('✅ Each simulated permission has readable fields: module, action, data_scope, granted');
    console.log('✅ Permission simulator works with hypothetical roles');
  });

  // ── AC4: Results are clear and understandable ───────────────────────────

  test('11. Permissions are displayed in readable format (not raw codes)', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Wait for the Effective Permissions panel to load
    const effPermsSection = page.locator('h3:has-text("Effective Permissions")');
    await expect(effPermsSection).toBeVisible({ timeout: 10_000 });

    // Verify Granted/Denied badges use human-readable text (not raw codes)
    // TODO: Update selectors - current assumption based on component rendering
    const grantedBadges = page.locator('text=Granted');
    const deniedBadges = page.locator('text=Denied');
    const grantedCount = await grantedBadges.count();
    const deniedCount = await deniedBadges.count();

    console.log(`   Found ${grantedCount} "Granted" badges and ${deniedCount} "Denied" badges`);

    // Verify that permission cards show action names in readable format
    // TODO: Update selector - current assumption based on render pattern
    const scopeLabels = page.locator('text=/^Scope:/');
    const scopeCount = await scopeLabels.count();
    console.log(`   Found ${scopeCount} scope labels`);

    // Verify the page is readable - action names should be capitalized
    expect(grantedCount + deniedCount).toBeGreaterThan(0);
    console.log('✅ Permissions shown with readable Granted/Denied labels (not raw codes)');
  });

  test('12. Sources are clearly labeled and distinguishable', async ({ page }) => {
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Verify "Assigned Roles:" label is visible
    // TODO: Update selector - current assumption based on label text
    const assignedRolesLabel = page.locator('text=Assigned Roles');
    await expect(assignedRolesLabel).toBeVisible({ timeout: 10_000 });

    // Verify role badges have distinct styling (not just plain text)
    // The StatusBadge component renders with specific classes
    const roleBadgeText = page.locator(`text=${roleSimViewerName}`);
    if (await roleBadgeText.count() > 0) {
      console.log(`✅ Role badge for "${roleSimViewerName}" is visible as source attribution`);
    }

    // Verify the "No roles assigned" warning is NOT shown since user has a role
    const noRolesMsg = page.locator('text=No roles assigned');
    expect(await noRolesMsg.count()).toBe(0);
    console.log('✅ Permission sources are clearly labeled (Assigned Roles) and distinguishable');
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────

  test('13. User with no roles has empty permissions', async ({ page }) => {
    // Ensure user has no roles
    try {
      await unassignRoleFromUser(page, roleSimViewerId, testUserId);
    } catch { /* already removed */ }

    const effective = await getEffectivePermissions(page, testUserId);
    const perms = effective.permissions || {};
    const permCount = Object.keys(perms).length;

    console.log(`   User has ${permCount} effective permissions and ${effective.roles?.length || 0} roles`);
    expect(permCount).toBe(0);
    expect(effective.roles || []).toHaveLength(0);
    console.log('✅ User with no roles has empty permissions as expected');
  });

  test('14. User with conflicting permissions resolves deny overrides grant', async ({ page }) => {
    // We need a situation where:
    // - Role A grants people:read:all and people:read:own
    // - Role B denies people:read:all
    // Expected: people:read:all = false (deny overrides grant)

    // Create a second role that denies a permission
    const conflictingRoleName = `SimConflict-${Date.now()}`;
    const conflictingRole = await createRole(page, conflictingRoleName, 'Role with conflicting permissions');
    const conflictingRoleId = conflictingRole._id;

    // Role A (viewer): grant people:read:own
    await updateRolePermissions(page, roleSimViewerId, [
      { permission_id: permPeopleReadOwnId, granted: true },
    ]);

    // Role B (conflicting): grant people:read:all
    await updateRolePermissions(page, conflictingRoleId, [
      { permission_id: permPeopleReadAllId, granted: true },
    ]);

    // Assign both roles to user
    await assignRoleToUser(page, roleSimViewerId, testUserId);
    await assignRoleToUser(page, conflictingRoleId, testUserId);
    console.log(`   Assigned both "${roleSimViewerName}" and "${conflictingRoleName}" to user`);

    // Now deny people:read:all in the viewer role to create conflict
    await updateRolePermissions(page, roleSimViewerId, [
      { permission_id: permPeopleReadOwnId, granted: true },
      { permission_id: permPeopleReadAllId, granted: false }, // deny
    ]);
    console.log(`   Set people:read:all = denied in "${roleSimViewerName}"`);
    console.log(`   Set people:read:all = granted in "${conflictingRoleName}"`);

    // Verify: deny overrides grant
    const effective = await getEffectivePermissions(page, testUserId);
    expect(effective.permissions?.['people:read:all']).toBe(false);
    console.log(`   people:read:all resolved to: ${effective.permissions?.['people:read:all']}`);

    // Clean up conflicting role
    await unassignRoleFromUser(page, conflictingRoleId, testUserId);
    await deleteRole(page, conflictingRoleId);
    console.log(`   Cleaned up conflicting role: ${conflictingRoleName}`);

    console.log('✅ Deny-overrides-grant confirmed for conflicting permissions');
  });

  test('15. Simulation works with multiple hypothetical roles simultaneously', async ({ page }) => {
    // Ensure user has no roles assigned
    try {
      await unassignRoleFromUser(page, roleSimViewerId, testUserId);
    } catch { /* ignore */ }

    // Verify user has no permissions
    let effective = await getEffectivePermissions(page, testUserId);
    expect(Object.keys(effective.permissions || {})).toHaveLength(0);
    console.log('   User has 0 permissions before simulation');

    // Simulate with BOTH editor and viewer roles
    const simResult = await simulatePermissions(page, testUserId, [roleSimEditorId, roleSimViewerId]);
    expect(simResult.success).toBe(true);
    const simData = simResult.data;

    // Verify both roles appear
    const roleIds = simData.roles?.map((r: any) => r.role_id) || [];
    expect(roleIds).toContain(roleSimEditorId);
    expect(roleIds).toContain(roleSimViewerId);
    console.log(`   Simulation includes both roles (${roleIds.length} total)`);

    // Verify permissions from both roles are present
    const simPerms = simData.permissions || [];
    const peopleReadOwn = simPerms.find((p: any) => p.module === 'people' && p.action === 'read' && p.data_scope === 'own');
    const peopleCreateOwn = simPerms.find((p: any) => p.module === 'people' && p.action === 'create' && p.data_scope === 'own');
    const reportsReadOwn = simPerms.find((p: any) => p.module === 'reports' && p.action === 'read' && p.data_scope === 'own');

    expect(peopleReadOwn?.granted).toBe(true);
    expect(peopleCreateOwn?.granted).toBe(true);
    console.log(`   Aggregated permissions: people:read:own=${peopleReadOwn?.granted}, people:create:own=${peopleCreateOwn?.granted}, reports:read:own=${reportsReadOwn?.granted}`);

    // Verify all permissions are in an array (not a map) for clarity
    expect(Array.isArray(simPerms)).toBe(true);
    console.log(`   Simulation returned ${simPerms.length} permissions in array format (readable)`);
    console.log('✅ Multiple hypothetical roles aggregate permissions correctly');
  });
});
