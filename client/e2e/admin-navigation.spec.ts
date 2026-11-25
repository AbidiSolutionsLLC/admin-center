// Plan 5.1: permission-driven navigation, groups per PRD AC-10. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Main' });

test('a member with only people:read:own sees Home and People, nothing else', async ({ page }) => {
  await signInTenant(page, { role: 'employee', permissions: ['people:read:own'] });
  await page.goto('/overview');
  await expect(nav(page).getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users' })).toBeVisible();
  for (const name of ['Structure', 'Admin roles', 'Security', 'Audit log', 'Company', 'Workflows']) {
    await expect(nav(page).getByRole('link', { name })).toHaveCount(0);
  }
});

test('the legacy role no longer grants items: a super_admin role with no permissions sees only Overview', async ({ page }) => {
  await signInTenant(page, { role: 'super_admin', permissions: [] });
  await page.goto('/overview');
  await expect(nav(page).getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(nav(page).getByRole('link', { name: 'Users' })).toHaveCount(0);
});

// Plan 04 C1: Audit log and Company sit on routers still guarded by role names, so the menu needs the role too.
test('Audit log and Company need the role their server routers allow, not only the permission', async ({ page }) => {
  await signInTenant(page, { role: 'HR Admin', permissions: ['people:read:all', 'organization:read:all', 'organization:update:all', 'audit_logs:read:all'] });
  await page.goto('/overview');
  await expect(nav(page).getByRole('link', { name: 'Structure', exact: true })).toBeVisible();
  for (const name of ['Audit log', 'Company']) {
    await expect(nav(page).getByRole('link', { name, exact: true })).toHaveCount(0);
  }
});

test('permissions open their groups', async ({ page }) => {
  await signInTenant(page, { role: 'Super Admin', permissions: ['people:read:all', 'organization:read:all', 'locations:read:all', 'apps:read:all', 'roles:read:all', 'audit_logs:read:all', 'workflows:read:all'] });
  await page.goto('/overview');
  for (const name of ['Users', 'Structure', 'Teams', 'Locations', 'Calendars & schedules', 'Apps & Access', 'Subscription', 'Admin roles', 'Audit log', 'Workflows', 'Approvals']) {
    await expect(nav(page).getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav(page).getByRole('link', { name: 'Security', exact: true })).toHaveCount(0);
});

// Test run 2026-11-24: an Employee could open /roles and /security by URL although the menu hid them.
test('a page the menu hides is closed by URL too, and its data is never requested', async ({ page }) => {
  let rolesCalled = false;
  let policiesCalled = false;
  await signInTenant(page, { role: 'Employee', permissions: ['people:read:own', 'organization:read:own'] });
  await page.route('**/api/v1/roles**', (route) => { rolesCalled = true; return fulfillJson(route, { success: true, data: [] }); });
  await page.route('**/api/v1/security/**', (route) => { policiesCalled = true; return fulfillJson(route, { success: true, data: [] }); });
  for (const path of ['/roles', '/roles/abc', '/security']) {
    await page.goto(path);
    await expect(page.getByRole('alert').getByText("You don't have access to this page")).toBeVisible();
  }
  expect(rolesCalled).toBe(false);
  expect(policiesCalled).toBe(false);
});

test('a member who holds the permission still opens the page', async ({ page }) => {
  await signInTenant(page, { role: 'Super Admin', permissions: ['roles:read:all'] });
  await page.route('**/api/v1/roles**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/roles');
  await expect(page.getByRole('heading', { name: 'Admin roles', level: 1 })).toBeVisible();
  await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
});
