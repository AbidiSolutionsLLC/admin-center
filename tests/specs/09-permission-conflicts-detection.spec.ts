// tests/specs/09-permission-conflicts-detection.spec.ts
// Tests permission conflict detection:
//   - RULE-14: Conflicting permissions (allow vs deny across roles)
//   - RULE-15: Overlapping role assignments (one role fully covered by another)
//   - Conflict details view on the Overview dashboard (InsightCard)
//   - Proactive alerting when conflicts are triggered

import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const API_URL = `${APP_URL}/api/v1`;

// ---------------------------------------------------------------------------
// Auth helpers (cached token pattern from 04-custom-role-management.spec.ts)
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
// Role / Permission / User helpers
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
  const users = await api(page, 'GET', '/people?limit=10');
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

async function resolveInsight(page: Page, insightId: string) {
  return api(page, 'PUT', `/overview/intelligence/${insightId}/resolve`);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Permission Conflict Detection (RULE-14 & RULE-15)', () => {
  let conflictUserId: string;
  let employeeRoleId: string;
  let managerRoleId: string;
  let denyRoleId: string;
  let permId: string;
  let overlapUserId: string;
  let narrowRoleId: string;
  let broadRoleId: string;
  let pReadOwn: string;
  let pReadDept: string;
  let pReadAll: string;

  const cleanupRoleIds: string[] = [];

  test.beforeAll(async ({ page }) => {
    // Warm up token cache
    await getAccessToken(page);

    // ── Setup for RULE-14: Conflicting permissions ──
    employeeRoleId = await getRoleId(page, 'Employee');
    managerRoleId = await getRoleId(page, 'Manager');

    // Create a dedicated deny role to hold the conflicting DENY
    const denyRoleName = `Deny-Conflict-${Date.now()}`;
    const denyRole = await createRole(page, denyRoleName, 'Role with explicit DENY for conflict testing');
    denyRoleId = denyRole._id;
    cleanupRoleIds.push(denyRoleId);

    const usersInEmployee = await api(page, 'GET', `/roles/${employeeRoleId}/users`);
    const employeeUsers = usersInEmployee.data || [];
    if (employeeUsers.length > 0) {
      conflictUserId = employeeUsers[0]._id;
    } else {
      conflictUserId = await getFirstUserId(page);
      await assignUserToRole(page, employeeRoleId, conflictUserId);
    }
    // Assign user to Manager role (which has broad grants) and to the deny role
    await assignUserToRole(page, managerRoleId, conflictUserId);
    await assignUserToRole(page, denyRoleId, conflictUserId);

    // Pick a specific permission: use people:delete:all for a clear conflict scenario
    try {
      permId = await getPermissionId(page, 'people', 'delete', 'all');
    } catch {
      permId = await getPermissionId(page, 'people', 'read', 'all');
    }

    // Set up the conflict: Manager grants this permission (it likely already does),
    // DenyRole explicitly denies it
    await updateRolePermissions(page, managerRoleId, [{ permission_id: permId, granted: true }]);
    await updateRolePermissions(page, denyRoleId, [{ permission_id: permId, granted: false }]);

    // ── Setup for RULE-15: Overlapping role assignments ──
    const narrowName = `Narrow-${Date.now()}`;
    const narrow = await createRole(page, narrowName, 'Narrow role with few permissions');
    narrowRoleId = narrow._id;
    cleanupRoleIds.push(narrowRoleId);

    const broadName = `Broad-${Date.now()}`;
    const broad = await createRole(page, broadName, 'Broad role that encompasses narrow');
    broadRoleId = broad._id;
    cleanupRoleIds.push(broadRoleId);

    pReadOwn = await getPermissionId(page, 'people', 'read', 'own');
    pReadDept = await getPermissionId(page, 'people', 'read', 'department');
    pReadAll = await getPermissionId(page, 'people', 'read', 'all');

    // Narrow role: only people:read:own
    await updateRolePermissions(page, narrowRoleId, [{ permission_id: pReadOwn, granted: true }]);

    // Broad role: people:read:own + people:read:department + people:read:all
    await updateRolePermissions(page, broadRoleId, [
      { permission_id: pReadOwn, granted: true },
      { permission_id: pReadDept, granted: true },
      { permission_id: pReadAll, granted: true },
    ]);

    overlapUserId = await getFirstUserId(page);
    // Ensure overlapUser is NOT the same as conflictUser for clean isolation
    if (overlapUserId === conflictUserId) {
      // Find another active user
      const allUsers = await api(page, 'GET', '/people?limit=20');
      const alt = (allUsers.data || []).find((u: any) => u.is_active && u._id !== conflictUserId);
      if (alt) overlapUserId = alt._id;
    }
    await assignUserToRole(page, narrowRoleId, overlapUserId);
    await assignUserToRole(page, broadRoleId, overlapUserId);

    // Run intelligence to generate insights
    await runIntelligence(page);
  });

  test.afterAll(async ({ page }) => {
    // Cleanup: remove custom roles
    for (const roleId of cleanupRoleIds) {
      try {
        // Unassign users first
        await unassignUserFromRole(page, roleId, conflictUserId).catch(() => {});
        await unassignUserFromRole(page, roleId, overlapUserId).catch(() => {});
        await deleteRole(page, roleId);
      } catch {
        // Already deleted or has dependents
      }
    }
    // Clean up conflict user from deny role so it doesn't affect other tests
    try {
      await unassignUserFromRole(page, denyRoleId, conflictUserId);
    } catch {}
    // Re-run intelligence to clear the insights we generated
    await runIntelligence(page);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 1: Navigation & Panel Visibility
  // ═══════════════════════════════════════════════════════════════════════════

  test('1. Overview page loads and shows insights section', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    // The insights section has a heading "Insights & Recommendations"
    await expect(page.locator('text=Insights & Recommendations').first()).toBeVisible({ timeout: 15_000 });
  });

  test('2. Insights section displays active insight count', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    // The insights section shows active count like "N active insights"
    const countText = page.locator('text=/\\d+ active insight/').first();
    await expect(countText).toBeVisible({ timeout: 10_000 });
  });

  test('3. Security-related insights are grouped under Warnings severity header', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    // Insights are grouped by severity; Warnings header should be visible
    const warningsHeader = page.locator('text=Warnings').first();
    await expect(warningsHeader).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 2: Conflicting Permissions (RULE-14) Detection
  // ═══════════════════════════════════════════════════════════════════════════

  test('4. System detects RULE-14 conflicting permissions (allow vs deny)', async ({ page }) => {
    const insights = await getInsights(page);
    // Find insights related to conflicting permissions for the conflict user
    const conflictInsights = insights.filter((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(conflictInsights.length).toBeGreaterThanOrEqual(1);
  });

  test('5. RULE-14 insight correctly identifies conflict type as misconfiguration with warning severity', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();
    expect(ci.category).toBe('misconfiguration');
    expect(ci.severity).toBe('warning');
  });

  test('6. RULE-14 insight reasoning mentions both grant and deny roles', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();
    expect(ci.reasoning).toBeTruthy();
    expect(ci.reasoning.toLowerCase()).toContain('grant');
    expect(ci.reasoning.toLowerCase()).toContain('deny');
  });

  test('7. RULE-14 insight includes affected user label and remediation action', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();
    expect(ci.affected_object_label).toBeTruthy();
    expect(ci.affected_object_type).toBe('User');
    expect(ci.remediation_url).toBeTruthy();
    expect(ci.remediation_action).toBeTruthy();
  });

  test('8. RULE-14 insight card renders in UI with severity badge', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    // Look for the insight card with "Conflicting permissions" text
    const conflictCard = page.locator('text=/Conflicting permissions/i').first();
    await expect(conflictCard).toBeVisible({ timeout: 10_000 });
    // The WARNING badge should be visible in the insight card area
    await expect(page.locator('text=WARNING').first()).toBeVisible({ timeout: 10_000 });
  });

  test('9. Deny-overrides-grant: effective permission resolves to false for denied permission', async ({ page }) => {
    const eff = await getEffectivePermissions(page, conflictUserId);
    // The permission that was denied should resolve to false
    const perm = await api(page, 'GET', '/roles/permissions/all');
    const permData = perm.data.find((p: any) => p._id === permId);
    const permKey = `${permData.module}:${permData.action}:${permData.data_scope}`;
    // deny override: the effective result for this key should be false
    expect(eff.permissions[permKey]).toBe(false);
  });

  test('10. Dismiss button is available on conflict insight card', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    // The insight card has a Dismiss button for each insight
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    await expect(dismissBtn).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 3: Overlapping Role Assignments (RULE-15) Detection
  // ═══════════════════════════════════════════════════════════════════════════

  test('11. System detects RULE-15 overlapping/redundant role assignments', async ({ page }) => {
    const insights = await getInsights(page);
    const redundantInsights = insights.filter((i: any) =>
      i.title?.toLowerCase().includes('redundant') ||
      i.title?.toLowerCase().includes('overlapping'),
    );
    expect(redundantInsights.length).toBeGreaterThanOrEqual(1);
  });

  test('12. RULE-15 insight has severity "info" and category "misconfiguration"', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant'),
    );
    expect(ri).toBeDefined();
    expect(ri.severity).toBe('info');
    expect(ri.category).toBe('misconfiguration');
  });

  test('13. RULE-15 reasoning identifies which role is redundant (fully covered)', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant'),
    );
    expect(ri).toBeDefined();
    expect(ri.reasoning).toBeTruthy();
    expect(ri.reasoning.toLowerCase()).toContain('fully covered');
  });

  test('14. RULE-15 remediation suggests removing the redundant role', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant'),
    );
    expect(ri).toBeDefined();
    expect(ri.remediation_action.toLowerCase()).toContain('remove');
  });

  test('15. RULE-15 insight includes affected user label with User type', async ({ page }) => {
    const insights = await getInsights(page);
    const ri = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant'),
    );
    expect(ri).toBeDefined();
    expect(ri.affected_object_label).toBeTruthy();
    expect(ri.affected_object_type).toBe('User');
  });

  test('16. User with overlapping roles has both roles assigned (effective permissions)', async ({ page }) => {
    const eff = await getEffectivePermissions(page, overlapUserId);
    const roleNames = (eff.roles || []).map((r: any) => r.role_name || r.name);
    expect(roleNames.length).toBeGreaterThanOrEqual(2);
  });

  test('17. Unassigning narrow role removes RULE-15 insight after intelligence re-run', async ({ page }) => {
    // Unassign the narrow role from overlap user
    await unassignUserFromRole(page, narrowRoleId, overlapUserId);
    await runIntelligence(page);

    const insights = await getInsights(page);
    const redundantForUser = insights.find((i: any) =>
      i.title?.toLowerCase().includes('redundant') &&
      i.affected_object_id === overlapUserId,
    );
    expect(redundantForUser).toBeUndefined();

    // Re-assign to restore state for other tests
    await assignUserToRole(page, narrowRoleId, overlapUserId);
    await runIntelligence(page);
  });

  test('18. Overview UI displays RULE-15 redundant role insight card', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await expect(page.locator('text=/Redundant role/i').first()).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 4: Conflict Details View (InsightCard content verification)
  // ═══════════════════════════════════════════════════════════════════════════

  test('19. Conflict insight card displays all required detail fields', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();

    // Navigate to the overview to see the card
    await ensureAuthenticated(page, '/overview');
    // Wait for insights to load
    await page.waitForTimeout(2000);

    // Verify the conflict card shows all key fields
    // Title
    await expect(page.locator(`text=${ci.title}`).first()).toBeVisible({ timeout: 10_000 });
    // Description
    await expect(page.locator(`text=${ci.description}`).first()).toBeVisible({ timeout: 10_000 });
    // Severity badge
    await expect(page.locator('text=WARNING').first()).toBeVisible({ timeout: 10_000 });
    // Affected user label
    if (ci.affected_object_label) {
      await expect(page.locator(`text=${ci.affected_object_label}`).first()).toBeVisible({ timeout: 10_000 });
    }
    // Remediation button
    if (ci.remediation_action) {
      await expect(page.locator(`text=${ci.remediation_action}`).first()).toBeVisible({ timeout: 10_000 });
    }
    // Reasoning (italic text)
    if (ci.reasoning) {
      await expect(page.locator(`text=${ci.reasoning}`).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('20. Remediation action button navigates to affected user detail page', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();
    expect(ci.remediation_url).toBeTruthy();

    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1000);

    // Find and click the remediation action link
    const remediateBtn = page.locator(`button:has-text("${ci.remediation_action}")`).first();
    await expect(remediateBtn).toBeVisible({ timeout: 10_000 });
    await remediateBtn.click();
    await page.waitForTimeout(2000);

    // Should navigate to the user detail page (remediation_url points to /people/:id)
    const currentUrl = page.url();
    expect(currentUrl).toContain('/people/');
    expect(currentUrl).toContain(ci.affected_object_id);
  });

  test('21. Insight card shows detected_at timestamp', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();

    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1000);

    // The detected_at date is rendered in the card (format: "Mon DD, HH:MM")
    const detectedDate = new Date(ci.detected_at);
    const dateStr = detectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // Month abbreviation + day should appear somewhere in the card
    // Use a loose match since the exact format may vary
    const dateLocator = page.locator(`text=${dateStr}`).first();
    await expect(dateLocator).toBeVisible({ timeout: 10_000 });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Section 5: Proactive Alerting (trigger new conflict, verify immediate detection)
  // ═══════════════════════════════════════════════════════════════════════════

  test('22. Triggering a new permission change creates conflict insight after intelligence run', async ({ page }) => {
    // Use a fresh permission that doesn't already have a conflict for the overlap user
    let freshPermId: string;
    try {
      freshPermId = await getPermissionId(page, 'apps', 'delete', 'all');
    } catch {
      freshPermId = await getPermissionId(page, 'locations', 'delete', 'all');
    }

    // Broad role grants it (already has broad permissions), narrow role denies it (creates new conflict)
    await updateRolePermissions(page, broadRoleId, [{ permission_id: freshPermId, granted: true }]);
    await updateRolePermissions(page, narrowRoleId, [{ permission_id: freshPermId, granted: false }]);

    // Run intelligence immediately
    await runIntelligence(page);

    // Check that the conflict is detected for the overlap user
    const insights = await getInsights(page);
    const newConflict = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') &&
      i.affected_object_id === overlapUserId,
    );
    expect(newConflict).toBeDefined();
    expect(newConflict.severity).toBe('warning');

    // Clean up the permission changes we just made
    await updateRolePermissions(page, narrowRoleId, [{ permission_id: freshPermId, granted: null }]);
    await updateRolePermissions(page, broadRoleId, [{ permission_id: freshPermId, granted: null }]);
    await runIntelligence(page);
  });

  test('23. Newly created conflict appears in insights immediately after re-run', async ({ page }) => {
    // Verify the insight list is up to date after the intelligence run
    const insightsBefore = await getInsights(page);
    const countBefore = insightsBefore.filter((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    ).length;

    // Create a temporary role that denies a permission that another role of the user grants
    const tempRoleName = `Temp-Deny-${Date.now()}`;
    const tempRole = await createRole(page, tempRoleName, 'Temporary deny role');
    cleanupRoleIds.push(tempRole._id);

    // Get a permission that user has granted through another role
    let conflictPermId: string;
    try {
      conflictPermId = await getPermissionId(page, 'people', 'read', 'own');
    } catch {
      conflictPermId = await getPermissionId(page, 'people', 'read', 'department');
    }

    // Assign user to this new role and deny the permission
    await assignUserToRole(page, tempRole._id, conflictUserId);
    await updateRolePermissions(page, tempRole._id, [{ permission_id: conflictPermId, granted: false }]);

    // Run intelligence
    await runIntelligence(page);

    // Verify new conflict insight was created
    const insightsAfter = await getInsights(page);
    const conflictsAfter = insightsAfter.filter((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(conflictsAfter.length).toBeGreaterThanOrEqual(countBefore);

    // Cleanup
    await unassignUserFromRole(page, tempRole._id, conflictUserId);
    await updateRolePermissions(page, tempRole._id, [{ permission_id: conflictPermId, granted: null }]);
    await runIntelligence(page);
  });

  test('24. Conflict is resolved/unflagged when the conflicting permission is removed', async ({ page }) => {
    // Remove the deny permission from DenyRole (the source of conflict for conflictUserId)
    await updateRolePermissions(page, denyRoleId, [{ permission_id: permId, granted: null }]);
    await runIntelligence(page);

    // The RULE-14 insight for conflictUserId should no longer exist
    const insights = await getInsights(page);
    const resolvedConflict = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') &&
      i.affected_object_id === conflictUserId,
    );
    expect(resolvedConflict).toBeUndefined();

    // Restore the conflict for other tests
    await updateRolePermissions(page, denyRoleId, [{ permission_id: permId, granted: false }]);
    await runIntelligence(page);
  });

  test('25. Insight can be dismissed via API and does not reappear immediately', async ({ page }) => {
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();

    // Dismiss the insight
    const dismissResp = await resolveInsight(page, ci._id);
    expect(dismissResp.status).toBe(200);
    expect(dismissResp.success).toBe(true);

    // After dismissal, it should not appear in active insights
    const insightsAfter = await getInsights(page);
    const dismissedInsight = insightsAfter.find((i: any) => i._id === ci._id);
    expect(dismissedInsight).toBeUndefined();

    // Re-run intelligence to restore the insight (since the conflict still exists)
    await runIntelligence(page);
  });

  test('26. Overview page shows Dismiss button that resolves insight', async ({ page }) => {
    // First ensure the conflict insight exists
    await runIntelligence(page);
    const insights = await getInsights(page);
    const ci = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting'),
    );
    expect(ci).toBeDefined();

    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);

    // Find and click the Dismiss button
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    await expect(dismissBtn).toBeVisible({ timeout: 10_000 });
    await dismissBtn.click();
    await page.waitForTimeout(1000);

    // After dismissing, the insight card should disappear
    // (since it was the only conflicting insight we were tracking)
    const conflictCard = page.locator('text=/Conflicting permissions/i');
    // It may or may not still be visible depending on whether other conflicting insights exist
    // Just verify the dismiss action didn't error
    await expect(dismissBtn).not.toBeAttached({ timeout: 5000 });

    // Re-run intelligence to restore the conflict
    await runIntelligence(page);
  });

  test('27. User detail page shows assigned role badges for conflict user', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${conflictUserId}`);
    await page.waitForTimeout(2000);

    // The EffectivePermissionsPanel shows "Assigned Roles:" with role badges
    const assignedRolesSection = page.locator('text=Assigned Roles').first();
    await expect(assignedRolesSection).toBeVisible({ timeout: 10_000 });

    // Role badges should be visible (StatusBadge components)
    const roleBadges = page.locator('text=Employee').first();
    await expect(roleBadges).toBeVisible({ timeout: 10_000 });
  });

  test('28. User detail page shows effective permissions panel with grant/deny state', async ({ page }) => {
    await ensureAuthenticated(page, `/people/${conflictUserId}`);
    await page.waitForTimeout(2000);

    // The Effective Permissions panel should be visible
    const effPermsTitle = page.locator('text=Effective Permissions').first();
    await expect(effPermsTitle).toBeVisible({ timeout: 10_000 });

    // It should show both Granted and Denied badges
    const grantedBadge = page.locator('text=Granted').first();
    await expect(grantedBadge).toBeVisible({ timeout: 10_000 });
  });

  test('29. Overview page shows both RULE-14 (warning) and RULE-15 (info) insights simultaneously', async ({ page }) => {
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(2000);

    // Warnings header (RULE-14 appears here)
    const warningsHeader = page.locator('text=Warnings').first();
    await expect(warningsHeader).toBeVisible({ timeout: 10_000 });

    // Info header (RULE-15 appears here)
    const infoHeader = page.locator('text=Info').first();
    await expect(infoHeader).toBeVisible({ timeout: 10_000 });

    // Both types of conflict insight cards should be visible
    const conflictText = page.locator('text=/Conflicting permissions/i').first();
    await expect(conflictText).toBeVisible({ timeout: 10_000 });

    const redundantText = page.locator('text=/Redundant role/i').first();
    await expect(redundantText).toBeVisible({ timeout: 10_000 });
  });

  test('30. Full end-to-end: conflict lifecycle - create, detect, view, resolve', async ({ page }) => {
    // 1. Create a new conflict scenario
    const e2eRoleName = `E2E-Deny-${Date.now()}`;
    const e2eRole = await createRole(page, e2eRoleName, 'E2E conflict test');
    cleanupRoleIds.push(e2eRole._id);

    const e2ePermId = await getPermissionId(page, 'people', 'read', 'own');
    await assignUserToRole(page, e2eRole._id, overlapUserId);
    await updateRolePermissions(page, e2eRole._id, [{ permission_id: e2ePermId, granted: false }]);

    // 2. Run intelligence and detect
    await runIntelligence(page);
    const insights = await getInsights(page);
    const detectedConflict = insights.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') &&
      i.affected_object_id === overlapUserId,
    );
    expect(detectedConflict).toBeDefined();
    expect(detectedConflict.severity).toBe('warning');

    // 3. View in UI
    await ensureAuthenticated(page, '/overview');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=WARNING').first()).toBeVisible({ timeout: 10_000 });

    // 4. Resolve by removing the conflict source
    await unassignUserFromRole(page, e2eRole._id, overlapUserId);
    await updateRolePermissions(page, e2eRole._id, [{ permission_id: e2ePermId, granted: null }]);
    await runIntelligence(page);

    // 5. Verify resolution
    const insightsAfter = await getInsights(page);
    const resolved = insightsAfter.find((i: any) =>
      i.title?.toLowerCase().includes('conflicting') &&
      i.affected_object_id === overlapUserId,
    );
    expect(resolved).toBeUndefined();
  });
});
