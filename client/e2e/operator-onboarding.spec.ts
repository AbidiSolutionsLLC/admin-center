// Plan 4.8: Onboarding list (GET /onboarding) and the per-tenant Onboarding tab. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const row = (id: string, name: string, stage: string, extra: Record<string, unknown> = {}) => ({
  organization: { id, slug: name.toLowerCase(), name, status: 'active' },
  stage,
  first_admin: { user_id: `u-${id}`, email: `admin@${name.toLowerCase()}.test`, full_name: `${name} Admin`, lifecycle_state: 'invited' },
  invitation: { state: 'pending', sent_at: '2026-11-15T10:00:00.000Z', sent_count: 1, expires_at: '2026-11-18T10:00:00.000Z', accepted_at: null, revoked_at: null },
  delivery: { status: 'sent', attempts: 1, last_error: null, sent_at: '2026-11-15T10:00:00.000Z', queued_at: '2026-11-15T10:00:00.000Z' },
  ...extra,
});

const ROWS = [
  row('c1', 'Acme', 'awaiting_acceptance'),
  row('c2', 'Beta', 'delivery_failed', { delivery: { status: 'failed', attempts: 5, last_error: 'ECONNREFUSED: relay down', sent_at: null, queued_at: '2026-11-15T10:00:00.000Z' } }),
];

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
});

test('list: rows with stage words, delivery error, row opens the Onboarding tab', async ({ page }) => {
  await page.route('**/operator/v1/onboarding**', (route) => fulfillJson(route, { success: true, data: ROWS, meta: { next_cursor: null } }));
  await page.route('**/operator/v1/orgs/c2', (route) => fulfillJson(route, { success: true, data: { id: 'c2', slug: 'beta', name: 'Beta', status: 'active', first_admin: null } }));
  await page.route('**/operator/v1/orgs/c2/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/operator/onboarding');
  await expect(page.getByRole('heading', { name: 'Onboarding', level: 1 })).toBeVisible();
  await expect(page.getByRole('row', { name: /Acme/ })).toContainText('Awaiting acceptance');
  await expect(page.getByRole('row', { name: /Beta/ })).toContainText('Delivery failed');
  await expect(page.getByRole('row', { name: /Beta/ })).toContainText('ECONNREFUSED: relay down');
  await page.getByRole('row', { name: /Beta/ }).click();
  await expect(page).toHaveURL(/\/operator\/organizations\/c2\?tab=onboarding/);
});

test('stage filter narrows the rows and is kept in the URL', async ({ page }) => {
  await page.route('**/operator/v1/onboarding**', (route) => fulfillJson(route, { success: true, data: ROWS, meta: { next_cursor: null } }));
  await page.goto('/operator/onboarding');
  await page.getByLabel('Stage').selectOption('delivery_failed');
  await expect(page).toHaveURL(/stage=delivery_failed/);
  await expect(page.getByRole('row', { name: /Beta/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Acme/ })).toHaveCount(0);
});

test('Resend invitation posts for that organization; hidden without onboarding.write', async ({ page }) => {
  let posted = '';
  await page.route('**/operator/v1/onboarding**', (route) => fulfillJson(route, { success: true, data: ROWS, meta: { next_cursor: null } }));
  await page.route('**/operator/v1/orgs/c2/onboarding/resend-invite', (route) => { posted = route.request().url(); return fulfillJson(route, { success: true, data: { invite_delivery_id: 'd1' } }); });
  await page.goto('/operator/onboarding');
  await page.getByRole('row', { name: /Beta/ }).getByRole('button', { name: 'Resend invitation' }).click();
  await expect.poll(() => posted).toContain('/orgs/c2/onboarding/resend-invite');

  await page.unroute('**/operator/v1/me');
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', roles: ['auditor'], status: 'active', permissions: ['tenants.read'] } })
  );
  await page.reload();
  await expect(page.getByRole('row', { name: /Beta/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend invitation' })).toHaveCount(0);
});

test('empty and error states', async ({ page }) => {
  await page.route('**/operator/v1/onboarding**', (route) => fulfillJson(route, { success: true, data: [], meta: { next_cursor: null } }));
  await page.goto('/operator/onboarding');
  await expect(page.getByText('Nobody is waiting')).toBeVisible();

  await page.unroute('**/operator/v1/onboarding**');
  await page.route('**/operator/v1/onboarding**', (route) => fulfillJson(route, { success: false, error: 'boom' }, 500));
  await page.reload();
  await expect(page.getByText('Failed to load data')).toBeVisible();
});

test('tenant Onboarding tab: stage, invitation facts and resend for a pending first admin', async ({ page }) => {
  let posted = false;
  await page.route('**/operator/v1/orgs/c1', (route) =>
    fulfillJson(route, { success: true, data: { id: 'c1', slug: 'acme', name: 'Acme', status: 'active', plan_key: 'pro', members_total: 1, members_active: 0, tags: [], first_admin: { email: 'admin@acme.test', full_name: 'Acme Admin', lifecycle_state: 'invited' } } })
  );
  await page.route('**/operator/v1/orgs/c1/onboarding', (route) => fulfillJson(route, { success: true, data: ROWS[0] }));
  await page.route('**/operator/v1/orgs/c1/onboarding/resend-invite', (route) => { posted = true; return fulfillJson(route, { success: true, data: {} }); });
  await page.route('**/operator/v1/orgs/c1/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/operator/organizations/c1?tab=onboarding');
  await expect(page.getByText('awaiting acceptance')).toBeVisible();
  await expect(page.getByText('Acme Admin (admin@acme.test)')).toBeVisible();
  await page.getByRole('button', { name: 'Resend invitation' }).click();
  await expect.poll(() => posted).toBe(true);
});
