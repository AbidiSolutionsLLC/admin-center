// Plan 4.9: Platform health on DashboardPage. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const comp = (component: string, state: string, detail: string) => ({ component, state, detail, metrics: null, checked_at: '2026-11-16T12:00:00.000Z' });
const SNAPSHOT = {
  state: 'degraded', stale: false,
  components: [
    comp('admin_api', 'healthy', '120 requests in 5 minutes, 0.0% 5xx'),
    comp('database', 'healthy', 'Ping 4 ms'),
    comp('jobs', 'degraded', '1 job(s) failed in the last hour'),
    comp('email', 'critical', '40.0% of e-mails failed in the last hour'),
  ],
  history: [{ id: 'h1', component: 'jobs', from: 'healthy', to: 'degraded', detail: '1 job(s) failed in the last hour', at: '2026-11-16T11:58:00.000Z' }],
};
const SYNC = {
  configured: true, answered: true, summary: null, fetched_at: '2026-11-16T12:00:00.000Z',
  rows: [{ org_id: 'c1', name: 'Acme', slug: 'acme', lag: 120, parked: 2, last_error_code: 'VALIDATION_ERROR', last_applied_seq: 1, pending_seq: 121, updated_at: null }],
};

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
});

test('overall state, component cards, recent change and sync row', async ({ page }) => {
  await page.route('**/operator/v1/health', (route) => fulfillJson(route, { success: true, data: SNAPSHOT }));
  await page.route('**/operator/v1/health/sync', (route) => fulfillJson(route, { success: true, data: SYNC }));
  await page.goto('/operator/health');
  await expect(page.getByRole('heading', { name: 'Platform health', level: 1 })).toBeVisible();
  await expect(page.getByText('Database')).toBeVisible();
  await expect(page.getByText('40.0% of e-mails failed in the last hour')).toBeVisible();
  await expect(page.getByText('Background jobs').first()).toBeVisible();
  await expect(page.getByText('healthy to degraded')).toBeVisible();
  await expect(page.getByRole('row', { name: /Acme/ })).toContainText('120');
  await expect(page.getByRole('row', { name: /Acme/ })).toContainText('VALIDATION_ERROR');
});

test('stale checks are called out; a products backend that is not configured says so', async ({ page }) => {
  await page.route('**/operator/v1/health', (route) => fulfillJson(route, { success: true, data: { ...SNAPSHOT, stale: true } }));
  await page.route('**/operator/v1/health/sync', (route) => fulfillJson(route, { success: true, data: { configured: false, answered: false, rows: [], summary: null, fetched_at: null } }));
  await page.goto('/operator/health');
  await expect(page.getByText('Stale')).toBeVisible();
  await expect(page.getByText('The products backend is not configured here.')).toBeVisible();
});

test('a failing section does not blank the page', async ({ page }) => {
  await page.route('**/operator/v1/health', (route) => fulfillJson(route, { success: true, data: SNAPSHOT }));
  await page.route('**/operator/v1/health/sync', (route) => fulfillJson(route, { success: false, error: 'boom' }, 500));
  await page.goto('/operator/health');
  await expect(page.getByText('Database')).toBeVisible();
  await expect(page.getByText('This section could not be loaded.')).toBeVisible();
});
