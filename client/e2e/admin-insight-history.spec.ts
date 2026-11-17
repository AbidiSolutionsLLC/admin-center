// Plan 5.8: Insight history with PageHeader and breadcrumb; chart colours from theme variables. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page); });

test('header, breadcrumb back to Overview, and an empty table', async ({ page }) => {
  await page.route('**/api/v1/overview/**', (route) => fulfillJson(route, {
    success: true, data: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 }, trends: [],
  }));
  await page.goto('/overview/insight-history');
  await expect(page.getByRole('heading', { name: 'Insight history & trends', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Breadcrumb').getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('No historical insights')).toBeVisible();
});

test('a failed load shows the error state', async ({ page }) => {
  await page.route('**/api/v1/overview/**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/overview/insight-history');
  await expect(page.getByText('Failed to load history')).toBeVisible();
});
