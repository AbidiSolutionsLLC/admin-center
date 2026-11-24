// Operator sidebar follows the `area.action` permissions from GET /operator/v1/me. Regression: the menu was empty for
// every operator because the matcher only understood tenant `module:action:scope` keys (commit 04863f0). API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const nav = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Main' });
const ALL_ITEMS = ['Overview', 'Organizations', 'Onboarding', 'Plans', 'Products', 'Platform health', 'Operators', 'Audit', 'Security'];

test.beforeEach(async ({ page }) => {
  await page.route('**/operator/v1/overview', (route) => fulfillJson(route, { success: true, data: { tenants: {}, health: { components: [] }, attention: { counts: {}, top: [] }, activity: [] } }));
});

test('a platform admin sees every operator menu item', async ({ page }) => {
  await signInOperator(page);
  await page.goto('/operator/overview');
  for (const name of ALL_ITEMS) await expect(nav(page).getByRole('link', { name, exact: true })).toBeVisible();
});

test('a support operator (read permissions only) sees the read items, not Operators, Audit or Security', async ({ page }) => {
  await signInOperator(page, ['overview.read', 'tenants.read', 'products.read', 'health.read', 'notes.write', 'onboarding.write']);
  await page.goto('/operator/overview');
  for (const name of ['Overview', 'Organizations', 'Onboarding', 'Plans', 'Products', 'Platform health']) {
    await expect(nav(page).getByRole('link', { name, exact: true })).toBeVisible();
  }
  for (const name of ['Operators', 'Audit', 'Security']) await expect(nav(page).getByRole('link', { name, exact: true })).toHaveCount(0);
});

test('when GET /operator/v1/me fails the rail says so and Retry restores the menu', async ({ page }) => {
  await signInOperator(page);
  let calls = 0;
  await page.route('**/operator/v1/me', (route) => {
    calls += 1;
    if (calls <= 2) return fulfillJson(route, { success: false, error: 'boom' }, 500); // the query retries once before it gives up
    return fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', full_name: 'Test Operator', roles: ['platform_admin'], status: 'active', permissions: ['overview.read', 'tenants.read'] } });
  });
  await page.goto('/operator/overview');
  await expect(page.getByRole('alert').filter({ hasText: 'The menu could not be loaded.' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(nav(page).getByRole('link', { name: 'Overview', exact: true })).toBeVisible();
});

test('on a desktop window the sidebar is open and the hamburger is hidden; on a narrow window the hamburger opens it', async ({ page }) => {
  await signInOperator(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/operator/overview');
  await expect(nav(page).getByRole('link', { name: 'Overview', exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(nav(page).getByRole('link', { name: 'Overview', exact: true })).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav(page).getByRole('link', { name: 'Overview', exact: true })).toBeInViewport();
});
