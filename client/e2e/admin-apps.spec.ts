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
  // 8b B-10: the status badge of a locked product does not say "active".
  await expect(page.getByTestId('product-card-desk').locator('xpath=ancestor::button[1]')).toContainText('not in plan');
});

test('8b B-9: a member who cannot manage apps and has none is told to ask an administrator', async ({ page }) => {
  await signInTenant(page, { role: 'employee', permissions: ['people:read:own'] }); // later routes win
  await page.route('**/api/v1/apps?**', (route) => fulfillJson(route, { success: true, data: [], pagination: { page: 1, pages: 0, total: 0 } }));
  await page.goto('/apps');
  await expect(page.getByText('You have no apps yet')).toBeVisible();
  await expect(page.getByText('Add apps to start managing access assignments.')).toHaveCount(0);
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

test('assigning Zyntrus: the target "Org role" lists organisation roles, and "Zyntrus role" is its own field with the Zyntrus roles', async ({ page }) => {
  await signInTenant(page, { role: 'Super Admin', permissions: ['apps:read:all'] }); // the Assign App button is for IT admins (later routes win)
  await page.route('**/api/v1/apps?**', (route) => fulfillJson(route, { success: true, data: [APP('zyntrus', 'Zyntrus')], pagination: { page: 1, pages: 1, total: 1 } }));
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, { success: true, data: { entitlements: [{ product_key: 'zyntrus', status: 'active', seats_limit: null, seats_used: 0 }] } }));
  await page.route('**/api/v1/apps/app-zyntrus', (route) => fulfillJson(route, { success: true, data: { ...APP('zyntrus', 'Zyntrus'), assignments: [] } }));
  await page.route('**/api/v1/apps/app-zyntrus/roles', (route) => fulfillJson(route, { success: true, data: [
    { key: 'zyntrus_admin', name: 'Account Manager', rank: 40, is_default: false, assignable: true },
    { key: 'recruiter', name: 'Recruiter', rank: 30, is_default: true, assignable: true },
  ] }));
  await page.route('**/api/v1/roles?**', (route) => fulfillJson(route, { success: true, data: [{ _id: 'r1', name: 'HR Admin', is_active: true }, { _id: 'r2', name: 'Employee', is_active: true }] }));
  await page.route('**/api/v1/roles', (route) => fulfillJson(route, { success: true, data: [{ _id: 'r1', name: 'HR Admin', is_active: true }, { _id: 'r2', name: 'Employee', is_active: true }] }));
  await page.goto('/apps');
  await page.getByRole('button', { name: /Zyntrus/ }).first().click();
  await page.getByRole('button', { name: 'Assign App' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Assign: Zyntrus');
  // Who gets it: an organisation role, named as one.
  await expect(dialog.getByRole('button', { name: 'Org role', exact: true })).toBeVisible();
  await expect(dialog.getByText('Select org role')).toBeVisible();
  await expect(dialog.getByRole('option', { name: 'HR Admin' })).toBeAttached();
  // What they get: the Zyntrus role, its own field, with the Zyntrus roles (and none of the organisation roles).
  const zyntrusRole = dialog.getByLabel('Zyntrus role');
  await expect(zyntrusRole.getByRole('option', { name: 'Account Manager' })).toBeAttached();
  await expect(zyntrusRole.getByRole('option', { name: 'Recruiter (default)' })).toBeAttached();
  await expect(zyntrusRole.getByRole('option', { name: 'HR Admin' })).toHaveCount(0);
});
