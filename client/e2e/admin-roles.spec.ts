// Plan 5.9: Admin roles on ListPage: populated, search, empty, error. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const ROLES = [
  { _id: 'r1', name: 'Super Admin', description: 'Everything', is_system: true, user_count: 1, permission_count: 65 },
  { _id: 'r2', name: 'Auditor', description: 'Read only', is_system: false, user_count: 2, permission_count: 4 },
];

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['roles:read:all'] }); });

test('lists roles under the Admin roles header', async ({ page }) => {
  await page.route('**/api/v1/roles**', (route) => fulfillJson(route, { success: true, data: ROLES }));
  await page.goto('/roles');
  await expect(page.getByRole('heading', { name: 'Admin roles', level: 1 })).toBeVisible();
  await expect(page.getByText('Auditor')).toBeVisible();
  await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
});

test('empty state', async ({ page }) => {
  await page.route('**/api/v1/roles**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/roles');
  await expect(page.getByText('No roles yet')).toBeVisible();
});

test('error state offers a retry', async ({ page }) => {
  await page.route('**/api/v1/roles**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/roles');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
