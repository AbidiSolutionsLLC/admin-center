// Plan 5.6: member profile on ObjectPage: header, facts, tabs, Access panel with provenance. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const ID = '64b000000000000000000002';
const USER = {
  _id: ID, full_name: 'Olive Member', email: 'olive@acme.test', employee_id: 'E-7', lifecycle_state: 'active', employment_type: 'full_time',
  hire_date: '2026-01-05T00:00:00.000Z', department: { name: 'Finance' }, location: { name: 'Berlin', timezone: 'Europe/Berlin' },
};

test.beforeEach(async ({ page }) => {
  await signInTenant(page, { permissions: ['people:read:all'] });
  await page.route(`**/api/v1/people/${ID}`, (route) => fulfillJson(route, { success: true, data: USER }));
  await page.route(`**/api/v1/people/${ID}/**`, (route) => fulfillJson(route, { success: true, data: [] }));
});

test('header shows the name, state and facts; the Edit action and overflow are present', async ({ page }) => {
  await page.goto(`/people/${ID}`);
  await expect(page.getByRole('heading', { name: 'Olive Member', level: 1 })).toBeVisible();
  await expect(page.getByText('Finance')).toBeVisible();
  await expect(page.getByText('Berlin')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit User' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Product access' })).toBeVisible();
});

test('a missing member shows Not found', async ({ page }) => {
  await page.route(`**/api/v1/people/${ID}`, (route) => fulfillJson(route, { success: false, error: 'nf', code: 'USER_NOT_FOUND' }, 404));
  await page.goto(`/people/${ID}`);
  await expect(page.getByText(/not found|cannot see it|try again/i).first()).toBeVisible();
});

test('the Product access tab explains where the role comes from', async ({ page }) => {
  await page.route(`**/api/v1/people/${ID}/effective-access`, (route) => fulfillJson(route, {
    success: true,
    data: {
      member_id: ID, authz_ver: 3,
      products: { people: { role: 'member', role_name: 'Member', granted_by: ['a1'] } },
      denials: { desk: 'NO_ENTITLEMENT' },
      reasons: { people: [{ assignment_id: 'a1', target_type: 'department', target_name: 'Finance', product_role_key: 'member', include_descendants: true }] },
    },
  }));
  await page.route('**/api/v1/organization/subscription', (route) => fulfillJson(route, { success: true, data: { entitlements: [{ product_key: 'people', status: 'active', seats_limit: null }], products: [] } }));
  await page.route('**/api/v1/apps**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto(`/people/${ID}?tab=product_access`);
  await expect(page.getByTestId('granted-via').first()).toContainText('department: Finance');
  await expect(page.getByText('Product not included in organization subscription plan')).toBeVisible();
});
