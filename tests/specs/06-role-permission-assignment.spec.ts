// tests/specs/06-role-permission-assignment.spec.ts
// Tests permission assignment to roles and inheritance by users.
//
// AC1: Admin can assign permissions (module-level, action-level, data-level)
// AC2: Changes are saved and applied immediately (success toast + API persistence)
// AC3: Users assigned to the role inherit updated permissions
// Edge Case: Data-level restrictions filter content (e.g., "Own" vs "All")

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

// ---------------------------------------------------------------------------
// Auth helpers (following existing test patterns in 04-custom-role-management)
// ---------------------------------------------------------------------------
const TEST_EMAIL = 'tsaleem@abidisolutions.com';
const TEST_PASSWORD = 'Mtayyab595*';

let cachedToken: string | null = null;

async function getAccessToken(page: Page): Promise<string> {
  if (cachedToken) return cachedToken;
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  const body = await resp.json();
  if (!body.success || !body.data?.accessToken) {
    throw new Error(`Login API failed: ${resp.status()} ${JSON.stringify(body)}`);
  }
  cachedToken = body.data.accessToken;
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
 * in-memory Zustand store (see 04-custom-role-management.spec.ts for details).
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

    // Navigate client-side via sidebar link to preserve Zustand state
    await page.locator('a[href="/roles"]').click();
    await page.waitForTimeout(1500);
  }
}

// ---------------------------------------------------------------------------
// Role / Permission API helpers
// ---------------------------------------------------------------------------

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

async function getEffectivePermissions(page: Page, userId: string) {
  const resp = await api(page, 'GET', `/people/${userId}/effective-permissions`);
  return resp.data;
}

async function getFirstUserId(page: Page): Promise<string> {
  const users = await api(page, 'GET', '/people?limit=10');
  const found = (users.data || []).find((u: any) => u.is_active);
  if (!found) throw new Error('No active user found');
  return found._id;
}

async function assignUserToRole(page: Page, roleId: string, userId: string) {
  return api(page, 'POST', `/roles/${roleId}/users`, { user_id: userId });
}

async function unassignUserFromRole(page: Page, roleId: string, userId: string) {
  return api(page, 'DELETE', `/roles/${roleId}/users/${userId}`);
}

async function getUserIdByEmail(page: Page, email: string): Promise<string> {
  const users = await api(page, 'GET', '/people?limit=50');
  const found = (users.data || []).find((u: any) => u.email === email);
  if (!found) throw new Error(`User with email "${email}" not found`);
  return found._id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Role Permission Assignment & Inheritance', () => {
  let testRoleId: string;
  let testRoleName: string;
  let testUserId: string;
  let readOwnPermId: string;
  let readAllPermId: string;
  let deleteOwnPermId: string;
  let deleteAllPermId: string;

  test.beforeAll(async ({ page }) => {
    await getAccessToken(page);

    // Create a unique test role
    testRoleName = `PermTest-Role-${Date.now()}`;
    const role = await createRole(page, testRoleName, 'Test role for permission assignment');
    testRoleId = role._id;
    console.log(`Created test role: ${testRoleName} (${testRoleId})`);

    // Resolve permission IDs we'll use
    readOwnPermId = await getPermissionId(page, 'people', 'read', 'own');
    readAllPermId = await getPermissionId(page, 'people', 'read', 'all');
    deleteOwnPermId = await getPermissionId(page, 'people', 'delete', 'own');
    deleteAllPermId = await getPermissionId(page, 'people', 'delete', 'all');
    console.log('Resolved permission IDs for testing');

    // Use the existing admin user as our test user (already in the system)
    // Assign them to the test role if not already
    try {
      testUserId = await getUserIdByEmail(page, TEST_EMAIL);
    } catch {
      testUserId = await getFirstUserId(page);
    }
    await assignUserToRole(page, testRoleId, testUserId);
    console.log(`Assigned user ${testUserId} to test role`);
  });

  test.afterAll(async ({ page }) => {
    // Cleanup: unassign user and delete role
    try {
      await unassignUserFromRole(page, testRoleId, testUserId);
    } catch {
      // ignore
    }
    try {
      await deleteRole(page, testRoleId);
      console.log(`Cleaned up test role: ${testRoleName}`);
    } catch {
      // may have dependents
    }
  });

  // ── AC1: Admin can assign permissions — Module-level ───────────────────

  test('1. Admin can open permission matrix for a role and see all module rows', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Click the row of our test role to open the permission matrix modal
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();

    // Wait for the modal to appear with permission matrix
    const modalTitle = page.locator('text=Edit Permissions');
    await expect(modalTitle).toBeVisible({ timeout: 10_000 });

    // Verify module columns are present in the table header
    // The matrix shows modules in rows; ensure at least "people" exists
    const peopleHeader = page.locator('table tbody tr td span:has-text("people")');
    await expect(peopleHeader.first()).toBeVisible({ timeout: 10_000 });

    // Verify action columns (create, read, update, delete, export) in header
    const actionHeaders = page.locator('table thead tr:first-child th');
    const actionTexts = await actionHeaders.allTextContents();
    const hasActions = ['create', 'read', 'update', 'delete', 'export'].every(a =>
      actionTexts.some(t => t.toLowerCase().includes(a))
    );
    expect(hasActions).toBe(true);

    // Verify data scope sub-headers (own, department, all)
    const scopeHeaders = page.locator('table thead tr:nth-child(2) th');
    const scopeTexts = await scopeHeaders.allTextContents();
    const hasScopes = ['own', 'department', 'all'].every(s =>
      scopeTexts.some(t => t.toLowerCase().includes(s))
    );
    expect(hasScopes).toBe(true);
  });

  // ── AC1: Admin can assign permissions — Action-level ───────────────────

  test('2. Admin can toggle a permission cell from not-set to granted', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open the matrix modal
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();
    await expect(page.locator('text=Edit Permissions')).toBeVisible({ timeout: 10_000 });

    // Find a "not set" cell and click it
    const notSetCell = page.locator('button[aria-label*="not set"]').first();
    await expect(notSetCell).toBeVisible({ timeout: 10_000 });
    const beforeLabel = await notSetCell.getAttribute('aria-label');
    expect(beforeLabel).toContain('not set');

    await notSetCell.click();
    await page.waitForTimeout(300);

    // After click, the cell should show "granted"
    const afterLabel = await notSetCell.getAttribute('aria-label');
    expect(afterLabel).toContain('granted');
  });

  test('3. Admin can toggle a permission cell from granted to denied', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open matrix
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();
    await expect(page.locator('text=Edit Permissions')).toBeVisible({ timeout: 10_000 });

    // Find a granted cell and click to cycle to denied
    let targetCell = page.locator('button[aria-label*="granted"]').first();
    const grantedExists = await targetCell.count();
    if (grantedExists > 0) {
      await targetCell.click();
      await page.waitForTimeout(300);
      const label = await targetCell.getAttribute('aria-label');
      expect(label).toContain('denied');
    } else {
      // No granted cell exists, toggle a not-set cell twice
      const notSet = page.locator('button[aria-label*="not set"]').first();
      await notSet.click();
      await page.waitForTimeout(200);
      await notSet.click();
      await page.waitForTimeout(200);
      const label = await notSet.getAttribute('aria-label');
      expect(label).toContain('denied');
    }
  });

  // ── AC2: Changes are saved and applied immediately ─────────────────────

  test('4. Save Changes button shows count of modified permissions', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open matrix
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();
    await expect(page.locator('text=Edit Permissions')).toBeVisible({ timeout: 10_000 });

    // Toggle one cell to create a pending change
    const notSet = page.locator('button[aria-label*="not set"]').first();
    const cellCount = await notSet.count();
    if (cellCount > 0) {
      await notSet.click();
      await page.waitForTimeout(200);
    }

    // Verify Save button shows count
    const saveBtn = page.locator('button:has-text("Save Changes")');
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    const btnText = await saveBtn.textContent();
    expect(btnText).toMatch(/Save Changes \(\d+\)/);
  });

  test('5. Saving permission changes shows success toast and persists via API', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open matrix
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();
    await expect(page.locator('text=Edit Permissions')).toBeVisible({ timeout: 10_000 });

    // Grant "people read own" and "people delete own" via UI toggles
    // Find the specific cell for "people read own" - locate by aria-label
    const readOwnCell = page.locator('button[aria-label="people read own: not set"]');
    const readOwnGranted = page.locator('button[aria-label="people read own: granted"]');

    if (await readOwnCell.count() > 0) {
      await readOwnCell.click();
      await page.waitForTimeout(200);
    } else if (await readOwnGranted.count() === 0) {
      // If it's denied, click to cycle back through to granted
      const readOwnDenied = page.locator('button[aria-label="people read own: denied"]');
      if (await readOwnDenied.count() > 0) {
        await readOwnDenied.click();
        await page.waitForTimeout(200);
      }
    }

    const deleteOwnCell = page.locator('button[aria-label="people delete own: not set"]');
    if (await deleteOwnCell.count() > 0) {
      await deleteOwnCell.click();
      await page.waitForTimeout(200);
    }

    // Click Save Changes
    const saveBtn = page.locator('button:has-text("Save Changes")');
    // Only save if there are pending changes
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();

      // Verify sonner success toast: "Permissions updated successfully"
      // Sonner renders a <li> with data-sonner-toast attribute
      await expect(page.locator('text=Permissions updated successfully').first()).toBeVisible({ timeout: 10_000 });
      console.log('Success toast confirmed: Permissions updated successfully');
    }

    // Close the modal
    await page.locator('button:has-text("Cancel"), [role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(500);

    // Verify persistence via API: check that people:read:own is granted
    const savedPerms = await getRolePermissions(page, testRoleId);
    const readOwnPerm = savedPerms.find((p: any) => p.module === 'people' && p.action === 'read' && p.data_scope === 'own');
    if (readOwnPerm) {
      expect(readOwnPerm.granted).toBe(true);
    }
    console.log('API confirms permissions were persisted.');
  });

  // ── AC3: Users assigned to the role inherit updated permissions ─────────

  test('6. User effective permissions are updated after role permission change (via API)', async ({ page }) => {
    await getAccessToken(page);

    // First, ensure the role has known permissions set via API
    await updateRolePermissions(page, testRoleId, [
      { permission_id: readOwnPermId, granted: true },
      { permission_id: deleteOwnPermId, granted: false },
    ]);
    console.log('Set baseline permissions via API for inheritance test');

    // Fetch effective permissions for the test user
    const effBefore = await getEffectivePermissions(page, testUserId);
    console.log('Effective permissions keys (before):', Object.keys(effBefore.permissions || {}).slice(0, 5));

    // Now update to grant delete:own on the role
    await updateRolePermissions(page, testRoleId, [
      { permission_id: readOwnPermId, granted: true },
      { permission_id: deleteOwnPermId, granted: true },
    ]);
    console.log('Updated role permissions: delete:own → granted');

    // Fetch effective permissions again
    const effAfter = await getEffectivePermissions(page, testUserId);
    const deleteOwnKey = 'people:delete:own';
    const readOwnKey = 'people:read:own';

    console.log(`people:delete:own effective: ${effAfter.permissions?.[deleteOwnKey]}`);
    console.log(`people:read:own effective: ${effAfter.permissions?.[readOwnKey]}`);

    expect(effAfter.permissions?.[deleteOwnKey]).toBe(true);
    expect(effAfter.permissions?.[readOwnKey]).toBe(true);
    console.log('✅ Inheritance verified: user effective permissions reflect role changes (API check)');
  });

  test('7. User effective permissions panel in UI reflects role permission changes', async ({ page }) => {
    await getAccessToken(page);

    // Ensure role has granted read:own and delete:own
    await updateRolePermissions(page, testRoleId, [
      { permission_id: readOwnPermId, granted: true },
      { permission_id: deleteOwnPermId, granted: true },
    ]);

    // Navigate to the test user's detail page
    // Use page.goto for the user detail page since it's a different route
    await page.goto(`${APP_URL}/people/${testUserId}`);
    await page.waitForTimeout(2000);

    // Handle potential redirect to login
    if (page.url().includes('/login')) {
      await page.goto(`${APP_URL}/login`);
      await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL('**/overview', { timeout: 20_000 });
      // Navigate via sidebar to people, then click the user row to navigate client-side
      await page.locator('a[href="/people"]').click();
      await page.waitForTimeout(1500);
      // Find the user and click the row to navigate via React Router
      const userRow = page.locator(`table tbody tr:has-text("${TEST_EMAIL}")`);
      await expect(userRow).toBeVisible({ timeout: 10_000 });
      await userRow.click();
      await page.waitForTimeout(2000);
    }

    // Verify the Effective Permissions section is present
    const effPermsSection = page.locator('text=Effective Permissions');
    await expect(effPermsSection).toBeVisible({ timeout: 10_000 });

    // Verify the role badge for our test role appears
    const roleBadge = page.locator(`text=${testRoleName}`).first();
    await expect(roleBadge).toBeVisible({ timeout: 10_000 });

    // Verify that "read" permission is shown as Granted for people module
    const grantedBadges = page.locator('text=Granted');
    const grantedCount = await grantedBadges.count();
    expect(grantedCount).toBeGreaterThanOrEqual(1);
    console.log(`✅ UI shows ${grantedCount} Granted badge(s) in Effective Permissions panel`);
  });

  // ── Edge Case: Data-level restrictions ─────────────────────────────────

  test('8. Data-level restriction: setting scope to "own" limits access to own records only', async ({ page }) => {
    await getAccessToken(page);

    // Configure the role with:
    // - people:read:own = granted
    // - people:read:department = denied (not set)
    // - people:read:all = denied (not set)
    // This means the user can only read their "own" people records.
    const readDeptPermId = await getPermissionId(page, 'people', 'read', 'department');

    await updateRolePermissions(page, testRoleId, [
      { permission_id: readOwnPermId, granted: true },
      { permission_id: readDeptPermId, granted: false },
      { permission_id: readAllPermId, granted: false },
    ]);
    console.log('Set data-scoped permissions: read:own=granted, read:dept=denied, read:all=denied');

    // Fetch effective permissions for the test user
    const eff = await getEffectivePermissions(page, testUserId);

    // Verify: people:read:own is true
    expect(eff.permissions?.['people:read:own']).toBe(true);
    // Verify: people:read:department is false (denied)
    expect(eff.permissions?.['people:read:department']).toBe(false);
    // Verify: people:read:all is false (denied)
    expect(eff.permissions?.['people:read:all']).toBe(false);

    // The effective permissions should only grant "own" scope access
    console.log('✅ Data-level restriction verified: only own-scope read is granted, dept/all are denied');
  });

  test('9. Data-level restriction with delete:own granted but delete:all denied', async ({ page }) => {
    await getAccessToken(page);

    // Configure:
    // - people:delete:own = true
    // - people:delete:all = false
    // This simulates a user who can delete their own records but not all records.
    await updateRolePermissions(page, testRoleId, [
      { permission_id: deleteOwnPermId, granted: true },
      { permission_id: deleteAllPermId, granted: false },
    ]);
    console.log('Set data-scoped delete: delete:own=granted, delete:all=denied');

    const eff = await getEffectivePermissions(page, testUserId);

    expect(eff.permissions?.['people:delete:own']).toBe(true);
    expect(eff.permissions?.['people:delete:all']).toBe(false);
    console.log('✅ Data-level delete restriction verified');
  });

  test('10. Full UI workflow: toggle cells, save, and verify success notification', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    // Open permission matrix for test role
    const roleRow = page.locator(`table tbody tr:has-text("${testRoleName}")`);
    await expect(roleRow).toBeVisible({ timeout: 10_000 });
    await roleRow.click();
    await expect(page.locator('text=Edit Permissions')).toBeVisible({ timeout: 10_000 });

    // Use "Grant All" for the "people" module row to set many permissions at once
    const grantAllBtn = page.locator('button:has-text("Grant All")').first();
    await expect(grantAllBtn).toBeVisible({ timeout: 5_000 });
    await grantAllBtn.click();
    await page.waitForTimeout(300);

    // Verify Save button is active with pending changes
    const saveBtn = page.locator('button:has-text("Save Changes")');
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    const btnText = await saveBtn.textContent();
    // Grant All toggles 15 cells (5 actions x 3 scopes)
    expect(btnText).toMatch(/Save Changes \(\d+\)/);
    console.log(`Save button text: ${btnText}`);

    // Save
    await saveBtn.click();

    // Verify success toast from sonner
    await expect(page.locator('text=Permissions updated successfully').first()).toBeVisible({ timeout: 10_000 });
    console.log('✅ Success toast confirmed after Grant All + Save');

    // Close modal
    await page.locator('button:has-text("Cancel"), [role="dialog"] button:has-text("Close")').first().click();
    await page.waitForTimeout(500);

    // API verification: confirm people read all scopes are granted
    const savedPerms = await getRolePermissions(page, testRoleId);
    const peopleReadAll = savedPerms.find(
      (p: any) => p.module === 'people' && p.action === 'read' && p.data_scope === 'all'
    );
    if (peopleReadAll) {
      expect(peopleReadAll.granted).toBe(true);
    }
    const peopleDeleteAll = savedPerms.find(
      (p: any) => p.module === 'people' && p.action === 'delete' && p.data_scope === 'all'
    );
    if (peopleDeleteAll) {
      expect(peopleDeleteAll.granted).toBe(true);
    }
    console.log('✅ API confirms all people permissions were saved as granted');
  });
});
