// Plan 4.10: Overview on DashboardPage. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const OVERVIEW = {
  tenants: { total: 12, active: 9, trial: 2, suspended: 1, onboarding: 3 },
  members_active: 340,
  health: { state: 'degraded', components: [{ component: 'jobs', state: 'degraded', detail: '1 failed' }, { component: 'database', state: 'healthy', detail: 'ok' }] },
  attention: {
    counts: { critical: 1, warning: 1, info: 0 },
    top: [
      { id: 'a1', kind: 'trial_ended', severity: 'critical', company_id: 'c1', summary: 'Acme: the trial ended 2 day(s) ago', link: '/operator/organizations/c1', first_seen_at: '2026-11-16T10:00:00.000Z' },
      { id: 'a2', kind: 'seats_near_limit', severity: 'warning', company_id: 'c2', summary: 'Globex: people uses 9 of 10 seats', link: '/operator/organizations/c2?tab=products', first_seen_at: '2026-11-16T10:00:00.000Z' },
    ],
  },
  activity: [{ id: 'e1', operator_email: 'op@karbexa.test', action: 'plan.applied', target_type: 'Plan', target_id: 'pro', category: 'plan', result: 'success', at: '2026-11-16T11:00:00.000Z' }],
};

test.beforeEach(async ({ page }) => { await signInOperator(page); });

test('tiles, attention list, health and activity', async ({ page }) => {
  await page.route('**/operator/v1/overview', (route) => fulfillJson(route, { success: true, data: OVERVIEW }));
  await page.goto('/operator');
  await expect(page).toHaveURL(/\/operator\/overview$/);
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  await expect(page.getByText('340')).toBeVisible();
  await expect(page.getByText('Acme: the trial ended 2 day(s) ago')).toBeVisible();
  await expect(page.getByText('Globex: people uses 9 of 10 seats')).toBeVisible();
  await expect(page.getByText('plan.applied')).toBeVisible();
});

test('a block that failed on the server shows only its own error', async ({ page }) => {
  await page.route('**/operator/v1/overview', (route) => fulfillJson(route, { success: true, data: { ...OVERVIEW, attention: { error: true } } }));
  await page.goto('/operator/overview');
  await expect(page.getByText('This section could not be loaded.')).toBeVisible();
  await expect(page.getByText('plan.applied')).toBeVisible();
});

test('nothing needs attention', async ({ page }) => {
  await page.route('**/operator/v1/overview', (route) => fulfillJson(route, { success: true, data: { ...OVERVIEW, attention: { counts: { critical: 0, warning: 0, info: 0 }, top: [] } } }));
  await page.goto('/operator/overview');
  await expect(page.getByText('Nothing needs attention.')).toBeVisible();
});
