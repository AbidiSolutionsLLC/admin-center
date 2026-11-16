// Plan 5.9: Groups on ListPage: populated, search, empty, error. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const GROUPS = [
  { _id: 'g1', name: 'Engineering', type: 'static', is_active: true, member_count: 3, created_at: '2026-11-01T00:00:00Z' },
  { _id: 'g2', name: 'Finance', type: 'static', is_active: true, member_count: 2, created_at: '2026-11-01T00:00:00Z' },
];

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['people:read:all'] }); });

test('lists groups and filters by search', async ({ page }) => {
  await page.route('**/api/v1/groups', (route) => fulfillJson(route, { success: true, data: GROUPS }));
  await page.goto('/groups');
  await expect(page.getByRole('heading', { name: 'User groups', level: 1 })).toBeVisible();
  await expect(page.getByText('Engineering')).toBeVisible();
  await page.getByRole('searchbox', { name: /search groups/i }).fill('Fin');
  await expect(page.getByText('Engineering')).toHaveCount(0);
  await expect(page.getByText('Finance')).toBeVisible();
});

test('empty state', async ({ page }) => {
  await page.route('**/api/v1/groups', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/groups');
  await expect(page.getByText('No groups yet')).toBeVisible();
});

test('error state offers a retry', async ({ page }) => {
  await page.route('**/api/v1/groups', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/groups');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
