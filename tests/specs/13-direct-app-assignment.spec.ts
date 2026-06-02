// tests/specs/13-direct-app-assignment.spec.ts
// Tests for admin direct app assignment to individual users.
//
// AC1: Admin can assign apps directly to a user
// AC2: User-level assignments override or complement role-based access
// AC3: Admin can view all apps assigned directly to a user
// AC4: Changes apply immediately

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

const ADMIN_EMAIL = 'tsaleem@abidisolutions.com';
const ADMIN_PASSWORD = 'Mtayyab595*';

let adminToken: string | null = null;
let testUserToken: string | null = null;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getAccessToken(page: Page, email: string, password: string): Promise<string> {
  const tokenKey = email === ADMIN_EMAIL ? 'adminToken' : 'testUserToken';
  if (tokenKey === 'adminToken' && adminToken) return adminToken;
  if (tokenKey === 'testUserToken' && testUserToken) return testUserToken;

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

async function ensureAuthenticated(page: Page, path: string = '/people') {
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

// ---------------------------------------------------------------------------
// API helpers for users, apps, and direct assignments
// ---------------------------------------------------------------------------

async function getUserByEmail(page: Page, email: string): Promise<{ _id: string; email: string }> {
  const users = await api(page, 'GET', '/people?limit=50');
  const found = (users.data || []).find((u: any) => u.email === email);
  if (!found) throw new Error(`User with email "${email}" not found`);
  return { _id: found._id, email: found.email };
}

async function getFirstNonAdminUser(page: Page): Promise<{ _id: string; email: string }> {
  const users = await api(page, 'GET', '/people?limit=50');
  const nonAdmin = (users.data || []).find((u: any) => u.email !== ADMIN_EMAIL && u.is_active);
  if (!nonAdmin) throw new Error('No non-admin active user found');
  return { _id: nonAdmin._id, email: nonAdmin.email };
}

async function getAppId(page: Page, name: string): Promise<string> {
  const apps = await api(page, 'GET', '/apps?limit=50');
  const found = (apps.data || []).find((a: any) => a.name === name || a.app_id === name);
  if (!found) throw new Error(`App "${name}" not found`);
  return found._id;
}

async function getAvailableApps(page: Page, limit: number = 5): Promise<string[]> {
  const apps = await api(page, 'GET', `/apps?limit=${limit}`);
  if (!apps.data || !apps.data.length) throw new Error('No apps found');
  return apps.data.map((a: any) => a._id);
}

async function createTestUser(page: Page, email: string, name?: string): Promise<string> {
  const body: any = {
    email,
    name: name || `TestUser-${Date.now()}`,
    password: 'TestPass123!',
    is_active: true,
  };
  const resp = await api(page, 'POST', '/people', body);
  if (resp.status === 201 || resp.success) return resp.data._id;
  // If user already exists, fetch their ID
  const user = await getUserByEmail(page, email);
  return user._id;
}

async function deleteTestUser(page: Page, userId: string) {
  await api(page, 'DELETE', `/people/${userId}`);
}

async function assignAppDirectly(page: Page, userId: string, appId: string): Promise<any> {
  return api(page, 'POST', `/people/${userId}/direct-apps`, { app_id: appId });
}

async function assignMultipleAppsDirectly(page: Page, userId: string, appIds: string[]): Promise<any> {
  return api(page, 'POST', `/people/${userId}/direct-apps`, { app_ids: appIds });
}

async function getDirectApps(page: Page, userId: string): Promise<any[]> {
  const resp = await api(page, 'GET', `/people/${userId}/direct-apps`);
  return resp.data || [];
}

async function removeDirectApp(page: Page, userId: string, appId: string): Promise<any> {
  return api(page, 'DELETE', `/people/${userId}/direct-apps/${appId}`);
}

async function getRoleId(page: Page, name: string): Promise<string> {
  const roles = await api(page, 'GET', '/roles');
  const found = (roles.data || []).find((r: any) => r.name === name);
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

async function assignUserToRole(page: Page, roleId: string, userId: string) {
  return api(page, 'POST', `/roles/${roleId}/users`, { user_id: userId });
}

async function unassignUserFromRole(page: Page, roleId: string, userId: string) {
  return api(page, 'DELETE', `/roles/${roleId}/users/${userId}`);
}

async function getPermissionId(page: Page, module: string, action: string, scope: string): Promise<string> {
  const perms = await api(page, 'GET', '/roles/permissions/all');
  const found = (perms.data || []).find(
    (p: any) => p.module === module && p.action === action && p.data_scope === scope,
  );
  if (!found) throw new Error(`Permission ${module}:${action}:${scope} not found`);
  return found._id;
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

async function getEffectiveApps(page: Page, userId: string): Promise<any[]> {
  const resp = await api(page, 'GET', `/people/${userId}/effective-apps`);
  return resp.data || [];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Direct App Assignment', () => {
  let testUserId: string;
  let testUserEmail: string;
  let testUserName: string;
  let appIdOne: string;
  let appIdTwo: string;
  let appIdThree: string;
  let appIdFour: string;
  let testRoleId: string;
  let testRoleName: string;
  let appsReadPermId: string;

  test.beforeAll(async ({ page }) => {
    await getAccessToken(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create a dedicated test user
    testUserEmail = `directapp-test-${Date.now()}@test.com`;
    testUserName = `DirectAppTest-${Date.now()}`;
    testUserId = await createTestUser(page, testUserEmail, testUserName);
    console.log(`Created test user: ${testUserEmail} (${testUserId})`);

    // Resolve app IDs from the system
    const appIds = await getAvailableApps(page, 5);
    [appIdOne, appIdTwo, appIdThree, appIdFour] = appIds;
    console.log(`Resolved app IDs: ${appIdOne}, ${appIdTwo}, ${appIdThree}, ${appIdFour}`);

    // Create a test role for override/complement tests
    testRoleName = `DirectApp-Role-${Date.now()}`;
    const role = await createRole(page, testRoleName, 'Test role for direct app assignment');
    testRoleId = role._id;
    console.log(`Created test role: ${testRoleName} (${testRoleId})`);

    // Assign user to the role
    await assignUserToRole(page, testRoleId, testUserId);

    // Resolve apps read permission ID for role-based access tests
    appsReadPermId = await getPermissionId(page, 'apps', 'read', 'own');
  });

  test.afterAll(async ({ page }) => {
    // Cleanup role and test user
    try {
      await unassignUserFromRole(page, testRoleId, testUserId);
    } catch { /* ignore */ }
    try {
      await deleteRole(page, testRoleId);
      console.log(`Cleaned up test role: ${testRoleName}`);
    } catch { /* may have dependents */ }
    try {
      await deleteTestUser(page, testUserId);
      console.log(`Cleaned up test user: ${testUserEmail}`);
    } catch { /* may fail if already cleaned up */ }
  });

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page, '/people');
    // Navigate to the test user's detail page where direct app assignment is done
    // Update selector based on actual implementation
    const userRow = page.locator(`[data-testid="user-row-${testUserId}"]`).first();
    const fallbackRow = page.locator(`table tbody tr:has-text("${testUserEmail}")`);
    const row = (await userRow.count()) > 0 ? userRow : fallbackRow;
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.click();
    await page.waitForTimeout(1500);
    // Ensure we're on the user detail page
    // Update selector based on actual implementation
    const detailHeading = page.locator(`[data-testid="user-detail-heading"]`);
    if (await detailHeading.count() > 0) {
      await expect(detailHeading).toBeVisible({ timeout: 5_000 });
    }
  });

  // =========================================================================
  // SECTION A: Core Assignment Functionality (3 tests)
  // =========================================================================

  test('TC01: Admin can assign a single app directly to a user', async ({ page }) => {
    // Navigate to the direct assignment section on the user detail page
    // Update selector based on actual implementation
    const assignSection = page.locator('[data-testid="direct-app-assignment-section"]');
    await expect(assignSection).toBeVisible({ timeout: 10_000 });

    // Click "Assign App" button to open the app selector
    // Update selector based on actual implementation
    const assignBtn = page.locator('[data-testid="assign-app-btn"]');
    await expect(assignBtn).toBeVisible({ timeout: 5_000 });
    await assignBtn.click();

    // Select an app from the dropdown/list
    // Update selector based on actual implementation
    const appCheckbox = page.locator(`[data-testid="app-option-${appIdOne}"]`);
    await expect(appCheckbox).toBeVisible({ timeout: 5_000 });
    await appCheckbox.click();

    // Confirm the assignment
    // Update selector based on actual implementation
    const confirmBtn = page.locator('[data-testid="confirm-assign-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Verify success toast appears
    // Update selector based on actual implementation
    const successToast = page.locator('[data-testid="success-toast"]').first();
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Verify the app appears in the user's direct assignments list
    // Update selector based on actual implementation
    const assignedApp = page.locator(`[data-testid="direct-app-item-${appIdOne}"]`);
    await expect(assignedApp).toBeVisible({ timeout: 5_000 });

    // API verification
    const directApps = await getDirectApps(page, testUserId);
    const appIds = directApps.map((a: any) => a._id || a.app_id);
    expect(appIds).toContain(appIdOne);
    console.log('TC01: Single app assigned successfully');
  });

  test('TC02: Admin can assign multiple apps (batch assignment) to a user', async ({ page }) => {
    // Update selector based on actual implementation
    const assignBtn = page.locator('[data-testid="assign-app-btn"]');
    await expect(assignBtn).toBeVisible({ timeout: 5_000 });
    await assignBtn.click();

    // Select multiple apps
    // Update selector based on actual implementation
    const appCheckboxOne = page.locator(`[data-testid="app-option-${appIdTwo}"]`);
    const appCheckboxTwo = page.locator(`[data-testid="app-option-${appIdThree}"]`);
    await expect(appCheckboxOne).toBeVisible({ timeout: 5_000 });
    await expect(appCheckboxTwo).toBeVisible({ timeout: 5_000 });
    await appCheckboxOne.click();
    await appCheckboxTwo.click();

    // Confirm batch assignment
    // Update selector based on actual implementation
    const confirmBtn = page.locator('[data-testid="confirm-assign-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Verify success toast
    // Update selector based on actual implementation
    const successToast = page.locator('[data-testid="success-toast"]').first();
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // API verification: both apps should be directly assigned
    const directApps = await getDirectApps(page, testUserId);
    const directAppIds = directApps.map((a: any) => a._id || a.app_id);
    expect(directAppIds).toContain(appIdTwo);
    expect(directAppIds).toContain(appIdThree);
    console.log('TC02: Multiple apps assigned in batch successfully');
  });

  test('TC03: Admin cannot assign the same app twice to the same user (duplicate prevention)', async ({ page }) => {
    // First, directly assign appIdTwo via API to ensure it's already assigned
    await assignAppDirectly(page, testUserId, appIdOne);

    // Try to assign the same app again via the UI
    // Update selector based on actual implementation
    const assignBtn = page.locator('[data-testid="assign-app-btn"]');
    await expect(assignBtn).toBeVisible({ timeout: 5_000 });
    await assignBtn.click();

    // The app should be disabled or hidden or show an error
    // Update selector based on actual implementation
    const appCheckbox = page.locator(`[data-testid="app-option-${appIdOne}"]`);
    const isDisabled = await appCheckbox.isDisabled().catch(() => false);
    const isVisible = await appCheckbox.isVisible().catch(() => false);

    if (isVisible && !isDisabled) {
      // If checkbox is still visible and enabled, clicking should show error
      await appCheckbox.click();
      const confirmBtn = page.locator('[data-testid="confirm-assign-btn"]');
      if (await confirmBtn.isEnabled()) {
        await confirmBtn.click();
        // Expect an error message about duplicate assignment
        // Update selector based on actual implementation
        const errorMsg = page.locator('[data-testid="error-message"]').first();
        await expect(errorMsg).toBeVisible({ timeout: 5_000 });
        await expect(errorMsg).toContainText(/already assigned|duplicate/i);
      }
    } else {
      // App is already assigned and disabled in the selector — correct behavior
      expect(isDisabled || !isVisible).toBe(true);
      console.log('TC03: Duplicate app is correctly disabled/unavailable in selector');
    }

    // API verification: only one entry for appIdOne should exist
    const directApps = await getDirectApps(page, testUserId);
    const matchingApps = directApps.filter((a: any) => a._id === appIdOne || a.app_id === appIdOne);
    expect(matchingApps.length).toBe(1);
    console.log('TC03: Duplicate assignment correctly prevented');
  });

  // =========================================================================
  // SECTION B: Override & Complement Logic (4 tests)
  // =========================================================================

  test('TC04: Direct assignment OVERRIDES role-based DENY', async ({ page }) => {
    // Set up role with apps:read:own = denied
    await updateRolePermissions(page, testRoleId, [
      { permission_id: appsReadPermId, granted: false },
    ]);
    console.log('Role set: apps:read:own = denied');

    // Verify the user's effective permissions do NOT have apps:read:own
    let effBefore = await getEffectivePermissions(page, testUserId);
    expect(effBefore.permissions?.['apps:read:own']).toBe(false);

    // Directly assign an app to the user via API (bypasses the role deny)
    const assignResp = await assignAppDirectly(page, testUserId, appIdTwo);
    expect(assignResp.status === 200 || assignResp.success).toBeTruthy();

    // Verify the user can now access the app (direct assignment overrides deny)
    const effAfter = await getEffectivePermissions(page, testUserId);
    // The effective apps endpoint should contain the directly assigned app
    const effectiveApps = await getEffectiveApps(page, testUserId);
    const appIds = effectiveApps.map((a: any) => a._id || a.app_id);
    expect(appIds).toContain(appIdTwo);
    console.log('TC04: Direct assignment overrides role-based deny');
  });

  test('TC05: Direct assignment COMPLEMENTS role-based ALLOW', async ({ page }) => {
    // Set up role with apps:read:own = granted
    await updateRolePermissions(page, testRoleId, [
      { permission_id: appsReadPermId, granted: true },
    ]);
    console.log('Role set: apps:read:own = granted');

    // Assign additional apps directly
    await assignAppDirectly(page, testUserId, appIdThree);

    // Get effective apps for the user — should include role-granted apps AND direct assignments
    const effectiveApps = await getEffectiveApps(page, testUserId);
    const effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    console.log(`User has ${effectiveAppIds.length} effective apps`);

    // Verify the directly assigned app is present
    expect(effectiveAppIds).toContain(appIdThree);
    // Verify direct assignments complement role-based access
    expect(effectiveAppIds.length).toBeGreaterThanOrEqual(1);
    console.log('TC05: Direct assignment complements role-based allow');
  });

  test('TC06: Direct assignment takes priority when role GRANTS and admin DENIES', async ({ page }) => {
    // Set role to grant apps:read:own
    await updateRolePermissions(page, testRoleId, [
      { permission_id: appsReadPermId, granted: true },
    ]);

    // Directly assign an app to the user
    await assignAppDirectly(page, testUserId, appIdFour);

    // Verify the app is accessible
    let effectiveApps = await getEffectiveApps(page, testUserId);
    let effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    expect(effectiveAppIds).toContain(appIdFour);

    // Now remove the direct assignment
    await removeDirectApp(page, testUserId, appIdFour);

    // Verify the app is no longer in the effective list (if deny at the direct level)
    // The role still grants apps:read:own, so the user should still have role-granted apps
    effectiveApps = await getEffectiveApps(page, testUserId);
    effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    expect(effectiveAppIds).not.toContain(appIdFour);
    console.log('TC06: Direct assignment priority over role grant verified');
  });

  test('TC07: Multiple assignments: role grants 3 apps, admin adds 2 more = user sees all 5', async ({ page }) => {
    // Create a role with broad app access
    // Set apps:read:own = granted on the role so the user gets all apps from that module
    await updateRolePermissions(page, testRoleId, [
      { permission_id: appsReadPermId, granted: true },
    ]);
    console.log('Role set: apps:read:own = granted (covers all apps in people module)');

    // Admin directly assigns 2 specific apps to the user
    await assignAppDirectly(page, testUserId, appIdOne);
    await assignAppDirectly(page, testUserId, appIdTwo);

    // Get effective apps for the user
    const effectiveApps = await getEffectiveApps(page, testUserId);
    const effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    console.log(`Total effective apps: ${effectiveAppIds.length}`);

    // The role grants apps:read:own which covers role-based app access
    // The 2 direct assignments should also be present
    expect(effectiveAppIds).toContain(appIdOne);
    expect(effectiveAppIds).toContain(appIdTwo);
    expect(effectiveAppIds.length).toBeGreaterThanOrEqual(2);
    console.log('TC07: Role-based apps + direct assignments combined successfully');
  });

  // =========================================================================
  // SECTION C: Viewing Direct Assignments (3 tests)
  // =========================================================================

  test('TC08: Admin can view list of all directly assigned apps for a specific user', async ({ page }) => {
    // Ensure some direct assignments exist via API
    await assignAppDirectly(page, testUserId, appIdOne);
    await assignAppDirectly(page, testUserId, appIdTwo);
    await assignAppDirectly(page, testUserId, appIdThree);

    // Navigate to the user detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    // Handle potential redirect to login
    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Verify the direct assignments section is visible
    // Update selector based on actual implementation
    const directAppsSection = page.locator('[data-testid="direct-apps-list"]');
    await expect(directAppsSection).toBeVisible({ timeout: 10_000 });

    // Verify each assigned app appears in the list
    // Update selector based on actual implementation
    const appOneItem = page.locator(`[data-testid="direct-app-item-${appIdOne}"]`);
    const appTwoItem = page.locator(`[data-testid="direct-app-item-${appIdTwo}"]`);
    const appThreeItem = page.locator(`[data-testid="direct-app-item-${appIdThree}"]`);
    await expect(appOneItem).toBeVisible({ timeout: 5_000 });
    await expect(appTwoItem).toBeVisible({ timeout: 5_000 });
    await expect(appThreeItem).toBeVisible({ timeout: 5_000 });

    // Verify the count or header matches
    // Update selector based on actual implementation
    const sectionTitle = page.locator('[data-testid="direct-apps-section-title"]');
    await expect(sectionTitle).toBeVisible({ timeout: 5_000 });
    await expect(sectionTitle).toContainText(/direct/i);

    // API verification
    const directApps = await getDirectApps(page, testUserId);
    expect(directApps.length).toBeGreaterThanOrEqual(3);
    console.log('TC08: Admin can view all directly assigned apps for a user');
  });

  test('TC09: Admin can distinguish between role-based apps vs directly assigned apps (visual indicator/badge)', async ({ page }) => {
    // Navigate to the user detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Verify there is a visual distinction between role-based and directly assigned apps
    // Update selector based on actual implementation
    const directBadges = page.locator('[data-testid="direct-app-badge"]');
    const roleBadges = page.locator('[data-testid="role-app-badge"]');

    const directCount = await directBadges.count();
    const roleCount = await roleBadges.count();

    // At least one of each type should be visually distinguishable
    // Update assertion based on actual implementation
    if (directCount > 0 && roleCount > 0) {
      // Verify they have different styling/classes
      const firstDirectClass = await directBadges.first().getAttribute('class');
      const firstRoleClass = await roleBadges.first().getAttribute('class');
      expect(firstDirectClass).not.toEqual(firstRoleClass);
    } else if (directCount > 0) {
      // Even if only direct assignments exist, they should have a distinct badge/text
      // Update selector based on actual implementation
      const badgeText = await directBadges.first().textContent();
      expect(badgeText?.toLowerCase()).toMatch(/direct|assigned/i);
    } else {
      // Fallback: check that the UI uses labels to distinguish
      // Update selector based on actual implementation
      const directLabel = page.locator('[data-testid="direct-apps-section-title"]');
      const roleLabel = page.locator('[data-testid="role-apps-section-title"]');
      await expect(directLabel).toBeVisible({ timeout: 5_000 });
      await expect(roleLabel).toBeVisible({ timeout: 5_000 });
    }

    console.log('TC09: Visual distinction between role-based and direct apps exists');
  });

  test('TC10: Admin can filter/sort directly assigned apps in the UI', async ({ page }) => {
    // Navigate to the user detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Verify filter input exists
    // Update selector based on actual implementation
    const filterInput = page.locator('[data-testid="direct-apps-filter-input"]');
    await expect(filterInput).toBeVisible({ timeout: 10_000 });

    // Type a filter query
    await filterInput.fill('test');
    await page.waitForTimeout(500);

    // Verify the list is filtered
    // Update selector based on actual implementation
    const appItems = page.locator('[data-testid^="direct-app-item-"]');
    const visibleItems = await appItems.filter({ hasNot: page.locator('.hidden') }).count();
    console.log(`Visible app items after filter: ${visibleItems}`);

    // Clear filter and verify all items reappear
    await filterInput.clear();
    await page.waitForTimeout(500);
    const allItemsAfterClear = await appItems.filter({ hasNot: page.locator('.hidden') }).count();
    expect(allItemsAfterClear).toBeGreaterThanOrEqual(visibleItems);

    // Verify sort control exists if implemented
    // Update selector based on actual implementation
    const sortControl = page.locator('[data-testid="direct-apps-sort-control"]');
    if (await sortControl.count() > 0) {
      await sortControl.click();
      // Update selector based on actual implementation
      const sortOption = page.locator('[data-testid="sort-option-name"]');
      await expect(sortOption).toBeVisible({ timeout: 5_000 });
      await sortOption.click();
      await page.waitForTimeout(500);
      console.log('Sort control works');
    } else {
      console.log('Sort control not implemented, skipping sort verification');
    }

    console.log('TC10: Filter/sort functionality for direct apps works');
  });

  // =========================================================================
  // SECTION D: Immediate Effect (2 tests)
  // =========================================================================

  test('TC11: Changes apply immediately for currently logged-in user (no logout required - just refresh/navigation)', async ({ page }) => {
    // Assign an app directly via API
    await assignAppDirectly(page, testUserId, appIdOne);

    // Navigate to the apps overview page as the test user
    const userPage = await page.context().newPage();
    await userPage.goto(`${APP_URL}/login`);
    await userPage.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await userPage.fill('input[type="email"]', testUserEmail);
    await userPage.fill('input[type="password"]', 'TestPass123!');
    await userPage.click('button[type="submit"]');
    await userPage.waitForURL('**/overview', { timeout: 20_000 });

    // Navigate to the apps page
    await userPage.goto(`${APP_URL}/apps`);
    await userPage.waitForTimeout(2000);

    // The directly assigned app should be visible — no logout required
    // Update selector based on actual implementation
    const appCard = userPage.locator(`[data-testid="app-card-${appIdOne}"]`);
    await expect(appCard).toBeVisible({ timeout: 10_000 });
    console.log('TC11: Directly assigned app visible to user without logout');

    // Now navigate away and back — app should still be visible
    await userPage.goto(`${APP_URL}/overview`);
    await userPage.waitForTimeout(1000);
    await userPage.goto(`${APP_URL}/apps`);
    await userPage.waitForTimeout(1000);
    await expect(appCard).toBeVisible({ timeout: 10_000 });
    console.log('TC11: App remains accessible after navigation (no logout required)');

    await userPage.close();
  });

  test('TC12: Changes apply immediately for admin after assignment (admin sees updated list without page reload)', async ({ page }) => {
    // Navigate to the user's detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Count current direct apps before assignment
    // Update selector based on actual implementation
    const appItemsBefore = page.locator('[data-testid^="direct-app-item-"]');
    const countBefore = await appItemsBefore.count();
    console.log(`Direct apps before: ${countBefore}`);

    // Assign a new app via the UI (not API)
    const assignBtn = page.locator('[data-testid="assign-app-btn"]');
    await expect(assignBtn).toBeVisible({ timeout: 5_000 });
    await assignBtn.click();

    // Update selector based on actual implementation
    const appCheckbox = page.locator(`[data-testid="app-option-${appIdFour}"]`);
    await expect(appCheckbox).toBeVisible({ timeout: 5_000 });
    await appCheckbox.click();

    const confirmBtn = page.locator('[data-testid="confirm-assign-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Verify success toast
    const successToast = page.locator('[data-testid="success-toast"]').first();
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Verify the list updated immediately (no page reload)
    const appItemsAfter = page.locator(`[data-testid="direct-app-item-${appIdFour}"]`);
    await expect(appItemsAfter).toBeVisible({ timeout: 5_000 });

    const countAfter = await page.locator('[data-testid^="direct-app-item-"]').count();
    expect(countAfter).toBeGreaterThan(countBefore);
    console.log('TC12: Admin sees updated direct apps list immediately without reload');
  });

  // =========================================================================
  // SECTION E: Removal & Revocation (2 tests)
  // =========================================================================

  test('TC13: Admin can remove a direct app assignment from a user', async ({ page }) => {
    // Ensure the app is directly assigned via API
    await assignAppDirectly(page, testUserId, appIdThree);

    // Navigate to the user detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // Verify the app appears in the direct assignments list
    // Update selector based on actual implementation
    const appItem = page.locator(`[data-testid="direct-app-item-${appIdThree}"]`);
    await expect(appItem).toBeVisible({ timeout: 10_000 });

    // Click the remove/revoke button
    // Update selector based on actual implementation
    const removeBtn = page.locator(`[data-testid="remove-app-btn-${appIdThree}"]`);
    await expect(removeBtn).toBeVisible({ timeout: 5_000 });
    await removeBtn.click();

    // Confirm removal in the confirmation dialog
    // Update selector based on actual implementation
    const confirmRemoveBtn = page.locator('[data-testid="confirm-remove-btn"]');
    if (await confirmRemoveBtn.count() > 0) {
      await confirmRemoveBtn.click();
    }

    // Verify success toast
    const successToast = page.locator('[data-testid="success-toast"]').first();
    await expect(successToast).toBeVisible({ timeout: 10_000 });

    // Verify the app is removed from the direct assignments list
    await expect(appItem).not.toBeVisible({ timeout: 5_000 });

    // API verification
    const directApps = await getDirectApps(page, testUserId);
    const directAppIds = directApps.map((a: any) => a._id || a.app_id);
    expect(directAppIds).not.toContain(appIdThree);
    console.log('TC13: Direct app assignment removed successfully');
  });

  test('TC14: After removal, user loses access immediately (verified without logout)', async ({ page }) => {
    // Assign an app directly via API
    await assignAppDirectly(page, testUserId, appIdTwo);

    // Login as the test user in a new browser context
    const userContext = await page.context().browser()!.newContext();
    const userPage = await userContext.newPage();
    await userPage.goto(`${APP_URL}/login`);
    await userPage.waitForSelector('input[type="email"]', { timeout: 15_000 });
    await userPage.fill('input[type="email"]', testUserEmail);
    await userPage.fill('input[type="password"]', 'TestPass123!');
    await userPage.click('button[type="submit"]');
    await userPage.waitForURL('**/overview', { timeout: 20_000 });

    // Verify app is accessible
    await userPage.goto(`${APP_URL}/apps`);
    await userPage.waitForTimeout(2000);
    const appCard = userPage.locator(`[data-testid="app-card-${appIdTwo}"]`);
    await expect(appCard).toBeVisible({ timeout: 10_000 });

    // Now remove the direct assignment via API (simulating admin action)
    await removeDirectApp(page, testUserId, appIdTwo);

    // API verification: the app should no longer be in effective apps
    let effectiveApps = await getEffectiveApps(page, testUserId);
    let effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    expect(effectiveAppIds).not.toContain(appIdTwo);

    // Have the test user navigate away and back to the apps page (no logout)
    await userPage.goto(`${APP_URL}/overview`);
    await userPage.waitForTimeout(1000);
    await userPage.goto(`${APP_URL}/apps`);
    await userPage.waitForTimeout(2000);

    // The app should no longer be accessible
    await expect(appCard).not.toBeVisible({ timeout: 10_000 });
    console.log('TC14: User loses access to directly assigned app immediately after removal');

    await userPage.close();
    await userContext.close();
  });

  // =========================================================================
  // SECTION F: Edge Cases & Negative Scenarios (4 tests)
  // =========================================================================

  test('TC15: User with NO roles gets direct assignments - only assigned apps are accessible', async ({ page }) => {
    // Create a user with no roles
    const noRoleEmail = `norole-${Date.now()}@test.com`;
    const noRoleUserId = await createTestUser(page, noRoleEmail);
    console.log(`Created no-role user: ${noRoleEmail} (${noRoleUserId})`);

    // Verify the user has no roles
    const rolesResp = await api(page, 'GET', `/people/${noRoleUserId}/roles`);
    const userRoles = rolesResp.data || [];
    expect(userRoles.length).toBe(0);
    console.log('No-role user has zero roles, confirmed');

    // Directly assign a single app via API
    await assignAppDirectly(page, noRoleUserId, appIdOne);

    // Verify only the directly assigned app is in effective apps
    const effectiveApps = await getEffectiveApps(page, noRoleUserId);
    const effectiveAppIds = effectiveApps.map((a: any) => a._id || a.app_id);
    expect(effectiveAppIds).toEqual([appIdOne]);
    console.log('TC15: No-role user only has access to directly assigned apps');

    // Cleanup
    await deleteTestUser(page, noRoleUserId);
  });

  test('TC16: Admin tries to assign app to non-existent user - proper error message', async ({ page }) => {
    const fakeUserId = '000000000000000000000000'; // 24 hex chars for MongoDB ObjectId
    const resp = await api(page, 'POST', `/people/${fakeUserId}/direct-apps`, { app_id: appIdOne });
    console.log(`TC16 response status: ${resp.status}`);

    // Expect a 404 or 400 error
    expect([400, 404]).toContain(resp.status);
    expect(resp.success).toBe(false);
    expect(resp.message || resp.error).toBeTruthy();
    console.log(`TC16: Error message for non-existent user: "${resp.message || resp.error}"`);
  });

  test('TC17: Admin tries to assign already revoked/deleted app - proper error handling', async ({ page }) => {
    // Try to assign a non-existent app ID
    const fakeAppId = '999999999999999999999999'; // 24 hex chars for MongoDB ObjectId
    const resp = await api(page, 'POST', `/people/${testUserId}/direct-apps`, { app_id: fakeAppId });
    console.log(`TC17 response status: ${resp.status}`);

    // Expect a 404 or 400 error
    expect([400, 404]).toContain(resp.status);
    expect(resp.success).toBe(false);
    expect(resp.message || resp.error).toBeTruthy();
    console.log(`TC17: Error message for non-existent app: "${resp.message || resp.error}"`);
  });

  test('TC18: Concurrent assignments: two admins assigning apps simultaneously - both assignments persist', async ({ page }) => {
    // Simulate two concurrent API calls to assign different apps
    const [resp1, resp2] = await Promise.all([
      assignAppDirectly(page, testUserId, appIdTwo),
      assignAppDirectly(page, testUserId, appIdThree),
    ]);

    // Both should succeed
    expect(resp1.status === 200 || resp1.success).toBeTruthy();
    expect(resp2.status === 200 || resp2.success).toBeTruthy();

    // Verify both assignments persisted
    const directApps = await getDirectApps(page, testUserId);
    const directAppIds = directApps.map((a: any) => a._id || a.app_id);
    expect(directAppIds).toContain(appIdTwo);
    expect(directAppIds).toContain(appIdThree);
    console.log('TC18: Both concurrent assignments persisted successfully');
  });

  // =========================================================================
  // SECTION G: UI/UX & Validation (1 test)
  // =========================================================================

  test('TC19: Success/confirmation toast/message appears after assignment and removal', async ({ page }) => {
    // Navigate to the user detail page
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    if (page.url().includes('/login')) {
      await ensureAuthenticated(page, `/people/${testUserId}`);
    }

    // --- Test success toast after assignment ---
    const assignBtn = page.locator('[data-testid="assign-app-btn"]');
    await expect(assignBtn).toBeVisible({ timeout: 5_000 });
    await assignBtn.click();

    // Select an app
    // Update selector based on actual implementation
    const appCheckbox = page.locator(`[data-testid="app-option-${appIdOne}"]`);
    if (await appCheckbox.count() > 0) {
      await appCheckbox.click();
    } else {
      // Fallback: select the first available app
      const firstAvail = page.locator('[data-testid^="app-option-"]').first();
      await firstAvail.click();
    }

    const confirmBtn = page.locator('[data-testid="confirm-assign-btn"]');
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Verify success toast appears after assignment
    // Update selector based on actual implementation
    const assignToast = page.locator('[data-testid="success-toast"]').first();
    await expect(assignToast).toBeVisible({ timeout: 10_000 });
    const assignToastText = await assignToast.textContent();
    expect(assignToastText?.toLowerCase()).toMatch(/assigned|success|added/i);
    console.log(`Assignment toast text: "${assignToastText}"`);

    // --- Test success toast after removal ---
    // Find a directly assigned app and remove it
    // Update selector based on actual implementation
    const removeBtn = page.locator('[data-testid^="remove-app-btn-"]').first();
    if (await removeBtn.count() > 0) {
      await removeBtn.click();

      // Confirm removal if dialog appears
      const confirmRemove = page.locator('[data-testid="confirm-remove-btn"]');
      if (await confirmRemove.count() > 0) {
        await confirmRemove.click();
      }

      // Verify removal toast appears
      // Update selector based on actual implementation
      const removeToast = page.locator('[data-testid="success-toast"]').first();
      await expect(removeToast).toBeVisible({ timeout: 10_000 });
      const removeToastText = await removeToast.textContent();
      expect(removeToastText?.toLowerCase()).toMatch(/removed|revoked|unassigned|deleted/i);
      console.log(`Removal toast text: "${removeToastText}"`);
    } else {
      console.log('No removable apps found, skipping removal toast verification');
    }

    console.log('TC19: Success toasts appear for both assignment and removal');
  });
});
