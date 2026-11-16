// Plan 5.9: Location detail on ObjectPage: header, facts, tabs, not found. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const ID = '64b0000000000000000000a1';
const LOCATION = { _id: ID, name: 'Berlin Office', type: 'office', timezone: 'Europe/Berlin', is_headquarters: true, parent_id: { _id: 'p1', name: 'Germany' } };

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['locations:read:all'] }); });

test('header, status badges, facts and the three tabs', async ({ page }) => {
  await page.route(`**/api/v1/locations/${ID}`, (route) => fulfillJson(route, { success: true, data: LOCATION }));
  await page.route(`**/api/v1/locations/${ID}/**`, (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto(`/locations/${ID}`);
  await expect(page.getByRole('heading', { name: 'Berlin Office', level: 1 })).toBeVisible();
  await expect(page.getByText('Under Germany')).toBeVisible();
  await expect(page.getByText('HQ')).toBeVisible();
  await expect(page.getByText('Europe/Berlin').first()).toBeVisible();
  for (const name of ['Overview', 'Policies', 'Users']) await expect(page.getByRole('tab', { name: new RegExp(name) })).toBeVisible();
});

test('a failed load shows the error state', async ({ page }) => {
  await page.route(`**/api/v1/locations/${ID}`, (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.route(`**/api/v1/locations/${ID}/**`, (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto(`/locations/${ID}`);
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
