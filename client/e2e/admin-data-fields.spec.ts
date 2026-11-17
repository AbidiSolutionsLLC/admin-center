// Plan 5.8: Data fields with PageHeader and one primary action. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['data_fields:read:all'] }); });

test('shows the header, the object tabs and the Add field action', async ({ page }) => {
  await page.route('**/api/v1/data-fields**', (route) => fulfillJson(route, {
    success: true,
    data: [{ _id: 'f1', name: 'shirt_size', label: 'Shirt size', field_type: 'text', target_object: 'user', required: false, display_order: 0, visibility: 'all', is_active: true }],
  }));
  await page.goto('/data-fields');
  await expect(page.getByRole('heading', { name: 'Data fields', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'People' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add field' }).first()).toBeVisible();
  await expect(page.getByText('Shirt size')).toBeVisible();
});

test('a failed load shows the error state', async ({ page }) => {
  await page.route('**/api/v1/data-fields**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/data-fields');
  await expect(page.getByText('Failed to load custom fields')).toBeVisible();
});
