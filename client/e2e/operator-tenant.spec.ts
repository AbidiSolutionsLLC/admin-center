// Plan 4.4: tenant profile on ObjectPage. Written now, run in Phase 7. API mocked (see helpers/auth.ts).
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const ORG = {
  id: 'c1', slug: 'acme', name: 'Acme', status: 'active', plan_key: 'professional', members_total: 10, members_active: 8, members_count: 10,
  products: ['people'], tags: ['pilot'], trial_ends_at: null, last_activity_at: '2026-11-15T10:00:00.000Z', entitlements: [],
  first_admin: { email: 'ada@acme.test', full_name: 'Ada Admin', lifecycle_state: 'active' },
};
const ALL = ['tenants.read', 'tenants.write', 'notes.write', 'onboarding.write', 'audit.read'];

async function mockApi(page: import('@playwright/test').Page, permissions = ALL) {
  await signInOperator(page);
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', roles: ['platform_admin'], status: 'active', permissions } })
  );
  await page.route('**/operator/v1/orgs/c1', (route) => fulfillJson(route, { success: true, data: ORG }));
  await page.route('**/operator/v1/orgs/missing', (route) => fulfillJson(route, { success: false, error: 'Organization not found', code: 'NOT_FOUND' }, 404));
  await page.route('**/operator/v1/orgs/c1/identity-providers', (route) =>
    fulfillJson(route, { success: true, data: [{ id: 'i1', type: 'entra', display_name: 'Acme Entra', status: 'draft', tenant_id: 'tid-1', tenant_approval: null }] })
  );
  await page.route('**/operator/v1/orgs/c1/products', (route) =>
    fulfillJson(route, { success: true, data: [{ product_key: 'people', name: 'People', status: 'active', source: 'plan', plan_key: 'professional', seats_limit: 50 }, { product_key: 'sign', name: 'Sign', status: 'not_entitled', source: null, plan_key: null, seats_limit: null }] })
  );
  await page.route('**/operator/v1/orgs/c1/admins', (route) =>
    fulfillJson(route, { success: true, data: [{ id: 'u1', full_name: 'Ada Admin', email: 'ada@acme.test', roles: ['Super Admin'], mfa_enabled: false, last_login_at: null, status: 'active' }] })
  );
  await page.route('**/operator/v1/orgs/c1/onboarding', (route) =>
    fulfillJson(route, { success: true, data: { stage: 'complete', first_admin: { user_id: 'u1', email: 'ada@acme.test', full_name: 'Ada Admin', lifecycle_state: 'active' }, invitation: null, delivery: null } })
  );
  await page.route('**/operator/v1/audit?**', (route) => fulfillJson(route, { success: true, data: [], meta: { next_cursor: null } }));
}

test('header, facts and tabs; Products and Admins tables', async ({ page }) => {
  await mockApi(page);
  await page.goto('/operator/organizations/c1');
  await expect(page.getByRole('heading', { name: 'Acme', level: 1 })).toBeVisible();
  await expect(page.getByText('8 active / 10')).toBeVisible();
  await page.getByRole('tab', { name: 'Products' }).click();
  await expect(page.getByRole('row', { name: /People/ })).toContainText('active');
  await expect(page.getByRole('row', { name: /Sign/ })).toContainText('not entitled');
  await page.getByRole('tab', { name: 'Admins' }).click();
  await expect(page.getByRole('row', { name: /Ada Admin/ })).toContainText('Off');
  await expect(page).toHaveURL(/tab=admins/);
});

test('Summary: Entra approval button posts the approval; tags are editable', async ({ page }) => {
  await mockApi(page);
  let approved = false;
  let patched: unknown = null;
  await page.route('**/operator/v1/orgs/c1/identity-providers/i1/approve-tenant', (route) => { approved = true; return fulfillJson(route, { success: true, data: {} }); });
  await page.route('**/operator/v1/orgs/c1', (route) => {
    if (route.request().method() === 'PATCH') { patched = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { id: 'c1' } }); }
    return fulfillJson(route, { success: true, data: ORG });
  });
  await page.goto('/operator/organizations/c1');
  await page.getByRole('button', { name: 'Approve tenant' }).click();
  await expect.poll(() => approved).toBe(true);
  await page.getByLabel('New tag').fill('emea');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(() => patched).toEqual({ tags: ['pilot', 'emea'] });
});

test('Notes: add a note; a read-only operator has no form', async ({ page }) => {
  await mockApi(page);
  let body: unknown = null;
  await page.route('**/operator/v1/orgs/c1/notes', (route) => {
    if (route.request().method() === 'POST') { body = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { id: 'n1' } }, 201); }
    return fulfillJson(route, { success: true, data: [{ id: 'n0', operator_id: 'o1', operator_email: 'op@karbexa.test', body: 'First note', created_at: '2026-11-16T10:00:00.000Z' }], meta: { next_cursor: null } });
  });
  await page.goto('/operator/organizations/c1?tab=notes');
  await expect(page.getByText('First note')).toBeVisible();
  await page.getByLabel('Add a note').fill('Second note');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect.poll(() => body).toEqual({ body: 'Second note' });

  await page.unroute('**/operator/v1/me');
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o1', email: 'op@karbexa.test', roles: ['auditor'], status: 'active', permissions: ['tenants.read'] } })
  );
  await page.reload();
  await expect(page.getByText('First note')).toBeVisible();
  await expect(page.getByLabel('Add a note')).toHaveCount(0);
});

test('not found and error states', async ({ page }) => {
  await mockApi(page);
  await page.goto('/operator/organizations/missing');
  await expect(page.getByText('Not found')).toBeVisible();
});
