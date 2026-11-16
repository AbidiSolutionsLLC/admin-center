// Plan 5.9: Notifications with the shared PageHeader and PageStates. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['notifications:read:all'] }); });

test('header, Create template action and both tabs', async ({ page }) => {
  await page.route('**/api/v1/notifications/templates**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create template' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delivery Log' })).toBeVisible();
});

test('a failed load shows the error state with a retry', async ({ page }) => {
  await page.route('**/api/v1/notifications/templates**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/notifications');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
