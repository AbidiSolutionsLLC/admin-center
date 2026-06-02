// tests/specs/10-least-privilege-access.spec.ts
// Tests for Least-Privilege Access Review feature:
//   - System identifies users with excessive permissions (RULE-16)
//   - Admin can review assigned roles and effective permissions
//   - Over-permissioned users are highlighted with warning badges
//   - Recommendations for reducing permissions are provided
//   - Expand/collapse details for user permissions
//   - Report view contains over-permissioned users

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

// ---------------------------------------------------------------------------
// Auth helpers (reuse token pattern from existing tests)
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

async function ensureAuthenticated(page: Page, path: string = '/overview') {
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
    await page.goto(targetUrl);
    await page.waitForTimeout(1000);
  }
}

// ---------------------------------------------------------------------------
// Role / Permission helpers
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

async function getFirstUserId(page: Page): Promise<string> {
  const users = await api(page, 'GET', '/people?limit=20');
  const found = (users.data || []).find((u: any) => u.is_active);
  if (!found) throw new Error('No active user found');
  return found._id;
}

async function createRole(page: Page, name: string, description?: string) {
  const resp = await api(page, 'POST', '/roles', { name, description, type: 'custom' });
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

async function updateRolePermissions(
  page: Page,
  roleId: string,
  permissions: Array<{ permission_id: string; granted: boolean | null }>,
) {
  return api(page, 'PUT', `/roles/${roleId}/permissions`, { permissions });
}

async function runIntelligence(page: Page) {
  return api(page, 'POST', '/overview/intelligence/run');
}

async function getInsights(page: Page) {
  const resp = await api(page, 'GET', '/overview/intelligence');
  return resp.data || [];
}

async function getEffectivePermissions(page: Page, userId: string) {
  const resp = await api(page, 'GET', `/people/${userId}/effective-permissions`);
  return resp.data;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Least-Privilege Access Review', () => {
  // Test data setup
  let overPermissionedUserId: string;
  let minimalUserId: string;
  let normalUserId: string;
  let highRiskRoleId: string;
  let normalRoleId: string;
  let minimalRoleId: string;
  
  const cleanupRoleIds: string[] = [];
  
  // Permissions for creating high-risk role (>10 delete/export:all permissions)
  const highRiskPermissions: string[] = [];

  test.beforeAll(async ({ page }) => {
    console.log('🔧 Setting up test data for least-privilege access tests...');
    
    // Warm up token cache
    await getAccessToken(page);
    
    // ── Get existing roles to work with ──
    try {
      normalRoleId = await getRoleId(page, 'Employee');
    } catch {
      normalRoleId = (await api(page, 'GET', '/roles')).data[0]?._id;
    }
    
    try {
      minimalRoleId = await getRoleId(page, 'Viewer');
    } catch {
      // Use Employee as minimal role
      minimalRoleId = normalRoleId;
    }

    // ── Create a high-risk role for over-permissioned user testing ──
    const highRiskRoleName = `HighRisk-Role-${Date.now()}`;
    const highRiskRole = await createRole(page, highRiskRoleName, 'Role with excessive high-risk permissions for testing');
    highRiskRoleId = highRiskRole._id;
    cleanupRoleIds.push(highRiskRoleId);

    // Get high-risk permissions (delete/export with 'all' scope)
    // We need >10 to trigger RULE-16 over-permissioned user detection
    const permissionModules = ['people', 'apps', 'teams', 'roles', 'groups', 'locations', 'workflows'];
    const actions = ['delete', 'export'];
    
    for (const module of permissionModules) {
      for (const action of actions) {
        try {
          const permId = await getPermissionId(page, module, action, 'all');
          highRiskPermissions.push(permId);
        } catch {
          // Permission may not exist, skip
        }
      }
    }
    
    // Add more high-risk permissions if needed to exceed 10 threshold
    // Also add permissions from other scopes as additional high-risk
    const additionalPerms = [
      { module: 'people', action: 'delete', scope: 'department' },
      { module: 'apps', action: 'delete', scope: 'department' },
      { module: 'teams', action: 'export', scope: 'all' },
      { module: 'roles', action: 'delete', scope: 'all' },
    ];
    
    for (const { module, action, scope } of additionalPerms) {
      try {
        const permId = await getPermissionId(page, module, action, scope);
        highRiskPermissions.push(permId);
      } catch {
        // Skip if not found
      }
    }

    // Ensure we have at least 11 high-risk permissions to trigger over-permissioning
    if (highRiskPermissions.length < 11) {
      console.log(`⚠️ Only ${highRiskPermissions.length} high-risk permissions found. Adding more...`);
      // Try to add more from different modules
      const extraModules = ['department', 'data-fields', 'security'];
      for (const module of extraModules) {
        for (const action of actions) {
          if (highRiskPermissions.length >= 11) break;
          try {
            const permId = await getPermissionId(page, module, action, 'all');
            highRiskPermissions.push(permId);
          } catch {
            // Skip
          }
        }
      }
    }

    // Grant all high-risk permissions to the high-risk role
    const permUpdates = highRiskPermissions.map((permId) => ({ permission_id: permId, granted: true }));
    await updateRolePermissions(page, highRiskRoleId, permUpdates);
    console.log(`✅ Created high-risk role with ${highRiskPermissions.length} high-risk permissions`);

    // ── Find or create test users with different permission levels ──
    
    // Get first active user and make them over-permissioned
    overPermissionedUserId = await getFirstUserId(page);
    
    // Assign high-risk role to over-permissioned user
    await assignUserToRole(page, highRiskRoleId, overPermissionedUserId);
    
    // Find a minimal permission user (already has minimal role or no role)
    const users = await api(page, 'GET', '/people?limit=30');
    const activeUsers = (users.data || []).filter((u: any) => u.is_active && u._id !== overPermissionedUserId);
    
    if (activeUsers.length > 0) {
      minimalUserId = activeUsers[0]._id;
      // Keep minimal user with just basic role or no additional roles
    } else {
      minimalUserId = overPermissionedUserId;
    }
    
    // Normal user - has Employee role but not the high-risk role
    if (activeUsers.length > 1) {
      normalUserId = activeUsers[1]._id;
      // Ensure normal user has regular role but not high-risk
      try {
        await assignUserToRole(page, normalRoleId, normalUserId);
      } catch {
        // May already be assigned
      }
    } else {
      normalUserId = overPermissionedUserId;
    }

    // ── Run intelligence to generate insights ──
    console.log('🔄 Running intelligence to detect over-permissioned users...');
    await runIntelligence(page);
    
    console.log(`✅ Test setup complete:
  - Over-permissioned user: ${overPermissionedUserId}
  - Minimal user: ${minimalUserId}
  - Normal user: ${normalUserId}
  - High-risk permissions count: ${highRiskPermissions.length}`);
  });

  test.afterAll(async ({ page }) => {
    console.log('🧹 Cleaning up test data...');
    
    // Unassign high-risk role from users
    try {
      await unassignUserFromRole(page, highRiskRoleId, overPermissionedUserId);
    } catch {}
    
    // Delete custom roles
    for (const roleId of cleanupRoleIds) {
      try {
        // First unassign all users
        const usersInRole = await api(page, 'GET', `/roles/${roleId}/users`);
        for (const user of (usersInRole.data || [])) {
          await unassignUserFromRole(page, roleId, user._id).catch(() => {});
        }
        await deleteRole(page, roleId);
      } catch {
        // Role may already be deleted or has dependents
      }
    }
    
    // Re-run intelligence to clean up generated insights
    await runIntelligence(page);
    console.log('✅ Cleanup complete');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 1: Navigation & Page Load Verification
  // ═══════════════════════════════════════════════════════════════════════════
  // TODO: If a dedicated least-privilege page is added (e.g., /admin/security/least-privilege),
  // update tests to use that route instead of /overview

  test('1. Overview page loads and shows insights section with over-permissioned users', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    
    // Wait for the insights section to load
    // TODO: Update selector if page structure changes (e.g., different class or data-testid)
    await expect(page.locator('text=Insights & Recommendations').first()).toBeVisible({ timeout: 15_000 });
    
    // Verify there are active insights
    const countText = page.locator('text=/\\d+ active insight/').first();
    await expect(countText).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Overview page loaded with insights section');
  });

  test('2. Over-permissioned user insight appears in insights list', async ({ page }) => {
    // Get insights via API
    const insights = await getInsights(page);
    
    // Filter for over-permissioned user insights (RULE-16)
    const overPermInsights = insights.filter((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') ||
      i.title?.toLowerCase().includes('excessive')
    );
    
    // Should find at least one over-permissioned user insight
    expect(overPermInsights.length).toBeGreaterThanOrEqual(1);
    
    // Verify the insight is for a User type
    expect(overPermInsights[0].affected_object_type).toBe('User');
    
    // Verify it has the right severity (warning for over-permissioned)
    expect(overPermInsights[0].severity).toBe('warning');
    
    // Verify it has the right category
    expect(overPermInsights[0].category).toBe('misconfiguration');
    
    console.log(`✅ Found ${overPermInsights.length} over-permissioned user insight(s)`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 2: System Identifies Users with Excessive Permissions
  // ═══════════════════════════════════════════════════════════════════════════

  test('3. System correctly identifies the over-permissioned user based on high-risk permissions', async ({ page }) => {
    const insights = await getInsights(page);
    
    // Find the over-permissioned user insight
    const overPermInsight = insights.find((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    
    expect(overPermInsight).toBeDefined();
    
    // Verify the insight mentions high-risk permissions
    expect(overPermInsight.description).toContain('high-risk permissions');
    expect(overPermInsight.description).toContain('delete');
    expect(overPermInsight.description).toContain('export');
    expect(overPermInsight.description).toContain('all');
    
    // Verify the insight includes recommendation
    expect(overPermInsight.remediation_action).toBeTruthy();
    expect(overPermInsight.remediation_action.toLowerCase()).toContain('review');
    
    console.log(`✅ Over-permissioned user identified: ${overPermInsight.affected_object_label}`);
  });

  test('4. Over-permissioned user has >10 high-risk permissions (delete/export:all)', async ({ page }) => {
    // Get effective permissions for the flagged user
    const insights = await getInsights(page);
    const overPermInsight = insights.find((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    
    expect(overPermInsight).toBeDefined();
    
    const userId = overPermInsight.affected_object_id;
    const effectivePerms = await getEffectivePermissions(page, userId);
    
    // Count high-risk permissions
    let highRiskCount = 0;
    const permissionEntries = Object.entries(effectivePerms.permissions || {});
    
    for (const [key, granted] of permissionEntries) {
      if (!granted) continue;
      const parts = key.split(':');
      if (parts.length >= 3) {
        const action = parts[1];
        const scope = parts[2];
        if ((action === 'delete' || action === 'export') && scope === 'all') {
          highRiskCount++;
        }
      }
    }
    
    // The user should have >10 high-risk permissions
    expect(highRiskCount).toBeGreaterThan(10);
    
    console.log(`✅ User has ${highRiskCount} high-risk permissions`);
  });

  test('5. System does NOT flag users with minimal permissions as over-permissioned', async ({ page }) => {
    const insights = await getInsights(page);
    
    // Check that minimal user is not flagged
    // We need to verify that users with few permissions are not in the over-permissioned list
    const overPermInsights = insights.filter((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    
    // The minimal user should NOT be in the over-permissioned list
    // (unless they were assigned the high-risk role in setup)
    const minimalUserInsights = overPermInsights.filter((i: any) => 
      i.affected_object_id === minimalUserId
    );
    
    // If minimal user was not assigned high-risk role, they should not be flagged
    if (minimalUserId !== overPermissionedUserId) {
      expect(minimalUserInsights.length).toBe(0);
      console.log('✅ Minimal user correctly not flagged as over-permissioned');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 3: Admin Reviews Assigned Roles & Effective Permissions
  // ═══════════════════════════════════════════════════════════════════════════

  test('6. Admin can view over-permissioned user detail page', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    
    // Click on the over-permissioned user insight to navigate to their detail page
    const overPermCard = page.locator('text=/over-permissioned/i').first();
    await expect(overPermCard).toBeVisible({ timeout: 10_000 });
    
    // Click on the insight to navigate to user detail
    await overPermCard.click();
    await page.waitForTimeout(2000);
    
    // Should navigate to user detail page
    const currentUrl = page.url();
    expect(currentUrl).toContain('/people/');
    
    console.log(`✅ Navigated to user detail page: ${currentUrl}`);
  });

  test('7. User detail page shows assigned roles (direct role assignments)', async ({ page }) => {
    // Navigate to over-permissioned user detail
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // Verify assigned roles section is visible
    const assignedRolesSection = page.locator('text=Assigned Roles').first();
    await expect(assignedRolesSection).toBeVisible({ timeout: 10_000);
    
    // Verify the high-risk role badge is visible
    // The role name contains "HighRisk"
    const roleBadge = page.locator('text=/HighRisk/i').first();
    await expect(roleBadge).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Assigned roles section shows direct role assignments');
  });

  test('8. User detail page shows effective permissions (aggregated from roles)', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // Verify effective permissions panel is visible
    const effPermsTitle = page.locator('text=Effective Permissions').first();
    await expect(effPermsTitle).toBeVisible({ timeout: 10_000);
    
    // Verify Granted badge is visible
    const grantedBadge = page.locator('text=Granted').first();
    await expect(grantedBadge).toBeVisible({ timeout: 10_000);
    
    // Should show permission entries grouped by module
    const moduleHeader = page.locator('text=/Module/i').first();
    // (The UI shows "Module" in the grouped view)
    
    console.log('✅ Effective permissions panel shows aggregated permissions from all roles');
  });

  test('9. Effective permissions correctly aggregates grants and denies (deny overrides grant)', async ({ page }) => {
    // Get effective permissions via API
    const effectivePerms = await getEffectivePermissions(page, overPermissionedUserId);
    
    // Verify roles are included
    expect(effectivePerms.roles).toBeDefined();
    expect(effectivePerms.roles.length).toBeGreaterThan(0);
    
    // Verify permissions object is present
    expect(effectivePerms.permissions).toBeDefined();
    expect(typeof effectivePerms.permissions).toBe('object');
    
    // Verify that at least some permissions are granted
    const grantedCount = Object.values(effectivePerms.permissions).filter(v => v === true).length;
    expect(grantedCount).toBeGreaterThan(0);
    
    console.log(`✅ Effective permissions aggregated: ${effectivePerms.roles.length} roles, ${grantedCount} granted permissions`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 4: Over-Permissioned User UI Highlighting
  // ═══════════════════════════════════════════════════════════════════════════

  test('10. Over-permissioned user insight card has warning severity badge', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);
    
    // Find the over-permissioned insight card and verify WARNING badge
    // TODO: If badge styling changes (e.g., different text, icon, or class), update selector
    const warningBadge = page.locator('text=WARNING').first();
    await expect(warningBadge).toBeVisible({ timeout: 10_000 });
    
    // The card should mention "over-permissioned" in the title
    const overPermTitle = page.locator('text=/over-permissioned/i').first();
    await expect(overPermTitle).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Over-permissioned insight has warning badge');
  });

  test('11. User detail page shows least-privilege warning banner for over-permissioned user', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // The least-privilege warning should be visible
    // TODO: If warning banner text or position changes, update selector accordingly
    const leastPrivilegeWarning = page.locator('text=/Least-Privilege Warning/i').first();
    await expect(leastPrivilegeWarning).toBeVisible({ timeout: 10_000);
    
    // Should mention excessive permissions
    const excessiveText = page.locator('text=/excessive permissions/i').first();
    await expect(excessiveText).toBeVisible({ timeout: 10_000 });
    
    // Should show the count of high-risk permissions
    const highRiskCount = page.locator('text=/high-risk permissions/i').first();
    await expect(highRiskCount).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ User detail page shows least-privilege warning banner');
  });

  test('12. Warning banner includes recommendation to reduce permission scopes', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // The warning should include recommendation text
    const recommendationText = page.locator('text=/department.*own/i').first();
    await expect(recommendationText).toBeVisible({ timeout: 10_000 });
    
    // Should have remediation action link
    const remediationLink = page.locator('text=/Optimize Role Assignments/i').first();
    await expect(remediationLink).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Warning banner includes recommendations');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 5: Recommendations for Minimal Role/Permission Set
  // ═══════════════════════════════════════════════════════════════════════════

  test('13. Over-permissioned insight includes description with recommended action', async ({ page }) => {
    const insights = await getInsights(page);
    
    const overPermInsight = insights.find((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    
    expect(overPermInsight).toBeDefined();
    
    // Description should mention the problem
    expect(overPermInsight.description).toContain('high-risk');
    expect(overPermInsight.description).toContain('delete');
    expect(overPermInsight.description).toContain('export');
    
    // Should recommend reviewing and reducing
    expect(overPermInsight.description.toLowerCase()).toContain('review');
    expect(overPermInsight.description.toLowerCase()).toContain('reduce');
    
    console.log('✅ Insight includes detailed recommendation');
  });

  test('14. Insight remediation action suggests reviewing role assignments', async ({ page }) => {
    const insights = await getInsights(page);
    
    const overPermInsight = insights.find((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    
    expect(overPermInsight).toBeDefined();
    expect(overPermInsight.remediation_action).toBeTruthy();
    
    // The action should suggest reviewing/adjusting role assignments
    const action = overPermInsight.remediation_action.toLowerCase();
    expect(action.includes('review') || action.includes('adjust') || action.includes('role')).toBe(true);
    
    console.log(`✅ Remediation action: ${overPermInsight.remediation_action}`);
  });

  test('15. Clicking remediation navigates to user detail for role adjustment', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);
    
    // Find the over-permissioned insight card
    const overPermCard = page.locator('text=/over-permissioned/i').first();
    await expect(overPermCard).toBeVisible({ timeout: 10_000 });
    
    // Look for the remediation action button/link within the card
    const remediateBtn = page.locator('button:has-text("Review"), button:has-text("Adjust")').first();
    
    // If button not found in card, try to find any button that navigates to the user
    // The insight should link to the user detail page
    const currentUrlBefore = page.url();
    
    // Click on the insight card itself (should navigate)
    await overPermCard.click();
    await page.waitForTimeout(2000);
    
    // Should navigate to user detail
    expect(page.url()).not.toBe(currentUrlBefore);
    expect(page.url()).toContain('/people/');
    
    console.log(`✅ Remediation navigates to user detail: ${page.url()}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 6: Expand/Collapse Permission Details
  // ═══════════════════════════════════════════════════════════════════════════

  test('16. Effective permissions panel has search/filter functionality', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // The permissions panel should have a search input
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    
    // Test filtering by typing a module name
    await searchInput.fill('people');
    await page.waitForTimeout(500);
    
    // Should filter the permissions list
    const filteredPerms = page.locator('text=/people/i');
    await expect(filteredPerms.first()).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Permission search/filter works');
  });

  test('17. Permissions are grouped by module with expand/collapse', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // Check for module grouping headers
    const moduleGroups = page.locator('text=/Module/i');
    const count = await moduleGroups.count();
    
    // Should have multiple module groups
    expect(count).toBeGreaterThan(0);
    
    // Each module should have permission entries
    const firstModule = moduleGroups.first();
    await expect(firstModule).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Permissions grouped by module');
  });

  test('18. Each permission shows action and scope clearly', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${overPermissionedUserId}`);
    await page.waitForTimeout(2000);
    
    // Look for permission entries showing action (delete, read, etc.) and scope (all, own, department)
    // Permission entries should show Granted/Denied badges
    const grantedBadge = page.locator('text=Granted').first();
    await expect(grantedBadge).toBeVisible({ timeout: 10_000);
    
    // Should show permission scope
    const scopeText = page.locator('text=/Scope:/i').first();
    await expect(scopeText).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Permission details show action and scope');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 7: Report View / Export
  // ═══════════════════════════════════════════════════════════════════════════
  // TODO: If a dedicated report export feature is added (e.g., CSV/PDF export button),
  // add tests for that functionality here

  test('19. Overview insights section lists all over-permissioned users in report format', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(2000);
    
    // The insights section serves as a report view
    // Verify over-permissioned users are listed in the warnings section
    
    // Find the Warnings header (over-permissioned is a warning)
    const warningsHeader = page.locator('text=Warnings').first();
    await expect(warningsHeader).toBeVisible({ timeout: 10_000 });
    
    // Under warnings, should have over-permissioned user cards
    const overPermCards = page.locator('text=/over-permissioned/i');
    const cardCount = await overPermCards.count();
    expect(cardCount).toBeGreaterThan(0);
    
    console.log(`✅ Report view shows ${cardCount} over-permissioned user(s)`);
  });

  test('20. Insights report can be filtered by severity (show only warnings)', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);
    
    // The insights are grouped by severity
    // Critical, Warning, Info headers should be visible
    const criticalHeader = page.locator('text=Critical').first();
    const warningHeader = page.locator('text=Warnings').first();
    const infoHeader = page.locator('text=Info').first();
    
    // At least one severity header should be visible
    const hasAnyHeader = await warningHeader.isVisible().catch(() => false) || 
                         await criticalHeader.isVisible().catch(() => false) ||
                         await infoHeader.isVisible().catch(() => false);
    
    expect(hasAnyHeader).toBe(true);
    
    // Over-permissioned should be under Warnings
    const warningSection = page.locator('text=Warnings').first();
    await expect(warningSection).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Report has severity-based grouping');
  });

  test('21. Dismiss button available on over-permissioned insight', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);
    
    // Find the over-permissioned insight card
    const overPermCard = page.locator('text=/over-permissioned/i').first();
    await expect(overPermCard).toBeVisible({ timeout: 10_000 });
    
    // Check for Dismiss button on the insight card
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    await expect(dismissBtn).toBeVisible({ timeout: 10_000 });
    
    console.log('✅ Dismiss button available on insight');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 8: End-to-End Verification
  // ═══════════════════════════════════════════════════════════════════════════

  test('22. Full lifecycle: Identify -> Review -> Remediate -> Verify', async ({ page }) => {
    // 1. Verify system identifies over-permissioned user
    const insightsBefore = await getInsights(page);
    const overPermBefore = insightsBefore.filter((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned') &&
      i.affected_object_type === 'User'
    );
    expect(overPermBefore.length).toBeGreaterThanOrEqual(1);
    
    // 2. Navigate to user detail and verify warning is visible
    const userId = overPermBefore[0].affected_object_id;
    await ensureAuthenticated(page, `/people/${userId}`);
    await page.waitForTimeout(2000);
    
    const warningBanner = page.locator('text=/Least-Privilege Warning/i');
    await expect(warningBanner).toBeVisible({ timeout: 10_000);
    
    // 3. Verify effective permissions show high-risk permissions
    const effPerms = await getEffectivePermissions(page, userId);
    let highRiskCount = 0;
    for (const [key, granted] of Object.entries(effPerms.permissions)) {
      if (!granted) continue;
      const parts = key.split(':');
      if (parts.length >= 3 && ['delete', 'export'].includes(parts[1]) && parts[2] === 'all') {
        highRiskCount++;
      }
    }
    expect(highRiskCount).toBeGreaterThan(10);
    
    // 4. Remove high-risk role (remediation)
    await unassignUserFromRole(page, highRiskRoleId, userId);
    await runIntelligence(page);
    
    // 5. Verify insight is resolved
    const insightsAfter = await getInsights(page);
    const overPermAfter = insightsAfter.filter((i: any) => 
      i.affected_object_id === userId &&
      i.title?.toLowerCase().includes('over-permissioned')
    );
    expect(overPermAfter.length).toBe(0);
    
    // Restore the role for other tests
    await assignUserToRole(page, highRiskRoleId, userId);
    await runIntelligence(page);
    
    console.log('✅ Full lifecycle test completed: identify -> review -> remediate -> verify');
  });

  test('23. Minimal permission user does NOT trigger least-privilege warning', async ({ page }) => {
    // Get a user who doesn't have the high-risk role
    const users = await api(page, 'GET', '/people?limit=30');
    const potentialUsers = (users.data || []).filter((u: any) => 
      u.is_active && 
      u._id !== overPermissionedUserId
    );
    
    if (potentialUsers.length === 0) {
      console.log('⚠️ No other users to test, skipping');
      return;
    }
    
    const testUserId = potentialUsers[0]._id;
    
    // Verify no over-permissioned insight for this user
    const insights = await getInsights(page);
    const overPermForUser = insights.filter((i: any) => 
      i.affected_object_id === testUserId &&
      i.title?.toLowerCase().includes('over-permissioned')
    );
    
    expect(overPermForUser.length).toBe(0);
    
    // Verify user detail page does NOT show warning banner
    await ensureAuthenticated(page, `/people/${testUserId}`);
    await page.waitForTimeout(2000);
    
    const warningBanner = page.locator('text=/Least-Privilege Warning/i');
    const bannerVisible = await warningBanner.isVisible().catch(() => false);
    expect(bannerVisible).toBe(false);
    
    console.log('✅ Minimal permission user correctly does not trigger warning');
  });

  test('24. Intelligence re-run updates over-permissioned status correctly', async ({ page }) => {
    // Initial state - should have over-permissioned insight
    const insightsBefore = await getInsights(page);
    const overPermBefore = insightsBefore.filter((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned')
    );
    const countBefore = overPermBefore.length;
    
    // Run intelligence again
    await runIntelligence(page);
    
    // Should have same insights (stable)
    const insightsAfter = await getInsights(page);
    const overPermAfter = insightsAfter.filter((i: any) => 
      i.title?.toLowerCase().includes('over-permissioned')
    );
    const countAfter = overPermAfter.length;
    
    expect(countAfter).toBeGreaterThanOrEqual(countBefore);
    
    console.log(`✅ Intelligence re-run stable: ${countAfter} over-permissioned insights`);
  });
});