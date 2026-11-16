// Plan 5.9: Organization structure with the shared PageHeader and PageStates. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['organization:read:all'] }); });

test('header and the Create department action; empty state when there are no departments', async ({ page }) => {
  await page.route('**/api/v1/organization', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.route('**/api/v1/organization/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/organization');
  await expect(page.getByRole('heading', { name: 'Organization structure', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create department' }).first()).toBeVisible();
  await expect(page.getByText('No departments yet')).toBeVisible();
});

test('a failed load shows the error state with a retry', async ({ page }) => {
  await page.route('**/api/v1/organization', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.route('**/api/v1/organization/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/organization');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
