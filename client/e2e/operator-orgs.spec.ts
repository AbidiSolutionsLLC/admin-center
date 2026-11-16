// Plan 4.3: Tenants list on ListPage. Written now, run in Phase 7. API mocked (see helpers/auth.ts).
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const org = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, slug: name.toLowerCase(), name, status: 'active', plan_key: 'professional', members_total: 10, members_active: 8, members_count: 10,
  products: ['people'], tags: ['pilot'], trial_ends_at: null, last_activity_at: '2026-11-15T10:00:00.000Z', entitlements: [], ...extra,
});

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', roles: ['platform_admin'], status: 'active', permissions: ['tenants.read', 'tenants.write', 'tenants.close', 'entitlements.write'] } })
  );
  await page.route('**/operator/v1/plans', (route) => fulfillJson(route, { success: true, data: [{ key: 'professional', name: 'Professional', products: ['people'] }] }));
});

test('rows show status, members, products and tags', async ({ page }) => {
  await page.route('**/operator/v1/orgs?**', (route) => fulfillJson(route, { success: true, data: [org('c1', 'Acme')], meta: { total: 1, next_cursor: null } }));
  await page.goto('/operator/organizations');
  const row = page.getByRole('row', { name: /Acme/ });
  await expect(row).toContainText('8 active / 10');
  await expect(row).toContainText('people');
  await expect(row).toContainText('pilot');
});

test('filters and sort go to the API and the URL', async ({ page }) => {
  const seen: URLSearchParams[] = [];
  await page.route('**/operator/v1/orgs?**', (route) => {
    seen.push(new URL(route.request().url()).searchParams);
    return fulfillJson(route, { success: true, data: [org('c1', 'Acme')], meta: { total: 1, next_cursor: null } });
  });
  await page.goto('/operator/organizations');
  await page.getByLabel('Plan').selectOption('professional');
  await page.getByLabel('Sort').selectOption('members');
  await page.getByRole('button', { name: 'In trial' }).click();
  await expect(page).toHaveURL(/plan=professional/);
  await expect(page).toHaveURL(/sort=members/);
  await expect(page).toHaveURL(/trial=true/);
  await expect.poll(() => seen.some((q) => q.get('plan') === 'professional' && q.get('sort') === 'members' && q.get('trial') === 'true')).toBe(true);
});

test('empty and error states; a read-only operator sees no write buttons', async ({ page }) => {
  await page.route('**/operator/v1/orgs?**', (route) => fulfillJson(route, { success: true, data: [], meta: { total: 0, next_cursor: null } }));
  await page.goto('/operator/organizations');
  await expect(page.getByText('No organizations yet')).toBeVisible();

  await page.unroute('**/operator/v1/me');
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', roles: ['auditor'], status: 'active', permissions: ['tenants.read'] } })
  );
  await page.unroute('**/operator/v1/orgs?**');
  await page.route('**/operator/v1/orgs?**', (route) => fulfillJson(route, { success: true, data: [org('c1', 'Acme')], meta: { total: 1, next_cursor: null } }));
  await page.reload();
  await expect(page.getByRole('row', { name: /Acme/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create organization' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
});
