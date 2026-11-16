// Plan 3.8 / 3.6: reference page "Plans" on ListPage. Written now, run in Phase 7. API mocked (see helpers/auth.ts).
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const PLANS = '**/operator/v1/plans';
const plans = [
  { key: 'starter', name: 'Starter', products: ['people'] },
  { key: 'suite', name: 'Suite', products: ['people', 'projects', 'sign'] },
];

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
});

test('populated: rows, product tags, operator marker, one primary action', async ({ page }) => {
  await page.route(PLANS, (route) => fulfillJson(route, { success: true, data: plans }));
  await page.goto('/operator/plans');
  await expect(page.getByRole('heading', { name: 'Plans', level: 1 })).toBeVisible();
  await expect(page.getByRole('row', { name: /starter/i })).toBeVisible();
  await expect(page.getByRole('row', { name: /suite/i })).toContainText('projects');
  await expect(page.getByRole('button', { name: 'Create plan' })).toHaveCount(1);
  await expect(page.getByLabel('Primary').getByText('Operator', { exact: true })).toBeVisible();
});

test('empty: explains and offers Create plan', async ({ page }) => {
  await page.route(PLANS, (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/operator/plans');
  await expect(page.getByText('No plans yet')).toBeVisible();
  await page.getByRole('button', { name: 'Create plan' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Create plan' })).toBeVisible();
});

test('error: shows the error state and Retry loads the list', async ({ page }) => {
  let calls = 0;
  await page.route(PLANS, (route) => {
    calls += 1;
    return calls === 1
      ? fulfillJson(route, { success: false, error: 'boom' }, 500)
      : fulfillJson(route, { success: true, data: plans });
  });
  await page.goto('/operator/plans');
  await expect(page.getByText('Failed to load data')).toBeVisible();
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('row', { name: /starter/i })).toBeVisible();
});

test('keyboard: a row opens the edit dialog with Enter', async ({ page }) => {
  await page.route(PLANS, (route) => fulfillJson(route, { success: true, data: plans }));
  await page.goto('/operator/plans');
  await page.getByRole('row', { name: /starter/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Edit plan: Starter/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
