// Plan 5.1: permission-driven navigation, groups per PRD AC-10. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { signInTenant } from './helpers/auth';

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
