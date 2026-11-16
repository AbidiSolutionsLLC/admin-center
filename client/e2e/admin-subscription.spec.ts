// Plan 5.5: Subscription, read-only plan, products, seats, trial. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const body = (extra: Record<string, unknown> = {}) => ({
  success: true,
  data: {
    entitlements: [
      { product_key: 'people', status: 'active', seats_limit: 10, source: 'plan', plan_key: 'professional', expires_at: null },
      { product_key: 'sign', status: 'active', seats_limit: null, source: 'operator', plan_key: null, expires_at: '2027-01-15T00:00:00.000Z' },
    ],
    products: [
      { product_key: 'people', name: 'People', description: null, app_id: 'a1', entitled: true, status: 'active', seats_limit: 10, seats_used: 9, default_role: null, included_in_plans: [] },
      { product_key: 'sign', name: 'Sign', description: null, app_id: 'a2', entitled: true, status: 'active', seats_limit: null, seats_used: 2, default_role: null, included_in_plans: [] },
      { product_key: 'desk', name: 'Desk', description: null, app_id: 'a3', entitled: false, status: null, seats_limit: null, seats_used: 0, default_role: null, included_in_plans: [] },
    ],
    plan: { key: 'professional', name: 'Professional' },
    trial_ends_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ...extra,
  },
});

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['apps:read:all'] }); });

test('shows plan, products, seats, trial and labels an operator entitlement as Override', async ({ page }) => {
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, body()));
  await page.goto('/subscription');
  await expect(page.getByTestId('subscription-tiles')).toContainText('Professional');
  await expect(page.getByTestId('subscription-tiles')).toContainText('2 of 3');
  await expect(page.getByTestId('subscription-tiles')).toContainText('day(s) left');
  await expect(page.getByTestId('sub-row-people')).toContainText('9 of 10');
  await expect(page.getByTestId('sub-row-sign')).toContainText('Override');
  await expect(page.getByTestId('sub-row-sign')).toContainText('until');
  await expect(page.getByTestId('sub-row-desk')).toContainText('Not included');
});

test('no trial: the tile says None', async ({ page }) => {
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, body({ trial_ends_at: null })));
  await page.goto('/subscription');
  await expect(page.getByTestId('subscription-tiles')).toContainText('None');
});

test('error state offers a retry', async ({ page }) => {
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/subscription');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
