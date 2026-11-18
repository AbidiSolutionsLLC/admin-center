// Plan 4.13: read-only Products catalogue. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const PRODUCTS = [
  { product_key: 'people', name: 'People', status: 'active', category: 'talent', manifest_version: 3, icon: null, launch_url: null, roles: 5, tenants_active: 12, tenants_suspended: 1, tenants_restricted: 2 },
  { product_key: 'sign', name: 'Sign', status: 'beta', category: 'core', manifest_version: 3, icon: null, launch_url: null, roles: 4, tenants_active: 3, tenants_suspended: 0, tenants_restricted: 0 },
];

test('catalogue: rows with status, manifest version and tenant counts; no create action for a read-only operator', async ({ page }) => {
  await signInOperator(page, ['overview.read', 'tenants.read', 'products.read', 'health.read']);
  // Read-only operator: not platform_admin, so the standalone registration action (WS-C C-7) is hidden.
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o2', email: 'sup@karbexa.test', full_name: 'Support', roles: ['support'], status: 'active', permissions: ['products.read'] } })
  );
  await page.route('**/operator/v1/products/standalone', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.route('**/operator/v1/products', (route) => fulfillJson(route, { success: true, data: PRODUCTS }));
  await page.goto('/operator/products');
  await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible();
  const people = page.getByRole('row', { name: /People/ });
  await expect(people).toContainText('active');
  await expect(people).toContainText('v3');
  await expect(people).toContainText('12');
  await expect(page.getByRole('row', { name: /Sign/ })).toContainText('beta');
  await expect(page.getByRole('button', { name: /create|add|register/i })).toHaveCount(0);
});

test('empty and error states', async ({ page }) => {
  await signInOperator(page);
  await page.route('**/operator/v1/products/standalone', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.route('**/operator/v1/products', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/operator/products');
  await expect(page.getByText('No products registered')).toBeVisible();

  await page.unroute('**/operator/v1/products');
  await page.route('**/operator/v1/products', (route) => fulfillJson(route, { success: false, error: 'boom' }, 500));
  await page.reload();
  await expect(page.getByText('Failed to load data')).toBeVisible();
});
