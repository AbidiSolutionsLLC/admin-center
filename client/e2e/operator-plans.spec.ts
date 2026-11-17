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
  let failing = true; // the app retries a failed read itself, so keep failing until the error state shows
  await page.route(PLANS, (route) => {
    return failing
      ? fulfillJson(route, { success: false, error: 'boom' }, 500)
      : fulfillJson(route, { success: true, data: plans });
  });
  await page.goto('/operator/plans');
  await expect(page.getByText('Failed to load data')).toBeVisible();
  failing = false;
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

test('plan 4.5: apply to organizations shows a preview, then queues the run', async ({ page }) => {
  let applied = false;
  await page.route(PLANS, (route) =>
    fulfillJson(route, { success: true, data: [{ key: 'suite', name: 'Suite', products: ['people', 'sign'], version: 3, tenant_count: 2, trial_days: 14 }] })
  );
  await page.route('**/operator/v1/plans/suite/apply**', (route) => {
    if (new URL(route.request().url()).searchParams.get('dry_run') === 'true') {
      return fulfillJson(route, { success: true, data: { added: [{ product_key: 'sign', tenants: 2 }], restricted: [{ product_key: 'desk', tenants: 1 }], unchanged: [{ product_key: 'people', tenants: 2 }], tenants_affected: 2 } });
    }
    applied = true;
    return fulfillJson(route, { success: true, data: { queued: 2, tenants_affected: 2 } }, 202);
  });
  await page.goto('/operator/plans');
  await expect(page.getByRole('row', { name: /suite/i })).toContainText('14 days');
  await page.getByRole('row', { name: /suite/i }).click();
  await page.getByRole('button', { name: 'Apply to organizations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Apply plan: Suite' });
  await expect(dialog).toContainText('sign: 2 organization(s)');
  await expect(dialog).toContainText('desk: 1 organization(s)');
  await dialog.getByRole('button', { name: 'Apply to 2 organization(s)' }).click();
  await expect.poll(() => applied).toBe(true);
});
