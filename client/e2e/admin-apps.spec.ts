// Plan 5.4: Apps & Access from the registry: seat meters, locked products, "why this role". Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const APP = (key: string, name: string) => ({ _id: `app-${key}`, name, slug: key, product_key: key, app_type: 'karbexa_product', category: 'hr', status: 'active', is_active: true, assignment_count: 2, description: `${name} product` });

const PRODUCTS = [
  { product_key: 'people', name: 'People', description: null, app_id: 'app-people', entitled: true, status: 'active', seats_limit: 10, seats_used: 4, default_role: { key: 'member', name: 'Member' }, included_in_plans: [] },
  { product_key: 'desk', name: 'Desk', description: null, app_id: 'app-desk', entitled: false, status: null, seats_limit: null, seats_used: 0, default_role: null, included_in_plans: [{ key: 'professional', name: 'Professional' }] },
];

test.beforeEach(async ({ page }) => {
  await signInTenant(page, { permissions: ['apps:read:all'] });
  await page.route('**/api/v1/apps?**', (route) => fulfillJson(route, { success: true, data: [APP('people', 'People'), APP('desk', 'Desk')], pagination: { page: 1, pages: 1, total: 2 } }));
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, { success: true, data: { entitlements: [{ product_key: 'people', status: 'active', seats_limit: 10, source: 'plan', plan_key: 'starter' }], products: PRODUCTS } }));
  for (const path of ['roles', 'organization', 'groups', 'people', 'locations']) {
    await page.route(`**/api/v1/${path}?**`, (route) => fulfillJson(route, { success: true, data: [] }));
    await page.route(`**/api/v1/${path}`, (route) => fulfillJson(route, { success: true, data: [] }));
  }
});

test('an entitled product shows its seat meter and default role', async ({ page }) => {
  await page.goto('/apps');
  const card = page.getByTestId('product-card-people');
  await expect(card).toContainText('4 of 10');
  await expect(card).toContainText('Default role: Member');
});

test('a product outside the plan is locked and names the plan that includes it', async ({ page }) => {
  await page.goto('/apps');
  await expect(page.getByTestId('product-locked')).toContainText('included in plan Professional');
});

test('why this role: picking a member lists the assignments behind the role', async ({ page }) => {
  const members = (route: import('@playwright/test').Route) => fulfillJson(route, { success: true, data: [{ _id: 'm1', full_name: 'Mia Member', email: 'mia@acme.test', lifecycle_state: 'active' }] });
  await page.route('**/api/v1/people', members);
  await page.route('**/api/v1/people?**', members);
  await page.route('**/api/v1/people/m1/effective-access', (route) => fulfillJson(route, {
    success: true,
    data: {
      member_id: 'm1', authz_ver: 1,
      products: { people: { role: 'member', role_name: 'Member', granted_by: ['a1'] } },
      denials: {},
      reasons: { people: [{ assignment_id: 'a1', target_type: 'group', target_name: 'Everyone', product_role_key: null, include_descendants: null }] },
    },
  }));
  await page.route('**/api/v1/apps/app-people', (route) => fulfillJson(route, { success: true, data: { ...APP('people', 'People'), assignments: [] } }));
  await page.goto('/apps');
  await page.getByRole('button', { name: /People/ }).first().click();
  await page.getByTestId('why-this-role').getByRole('combobox').selectOption('m1');
  await expect(page.getByTestId('access-people')).toContainText('Group: Everyone');
  await expect(page.getByTestId('access-people')).toContainText('gives the default role');
});
