// Plan 5.9: Teams with the shared PageHeader and PageStates. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['organization:read:all'] }); });

test('header with the Create Team action, and an empty state', async ({ page }) => {
  await page.route('**/api/v1/teams**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/teams');
  await expect(page.getByRole('heading', { name: 'Teams', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Team' }).first()).toBeVisible();
  await expect(page.getByText('No teams yet')).toBeVisible();
});

test('a failed load shows the error state with a retry', async ({ page }) => {
  await page.route('**/api/v1/teams**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/teams');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
