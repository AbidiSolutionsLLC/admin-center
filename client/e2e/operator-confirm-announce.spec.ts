// Plan 4.12: typed confirmation on suspend, three-step create dialog, announcement dialog and tenant banner. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const ME = { id: 'o1', email: 'op@karbexa.test', roles: ['platform_admin'], status: 'active', permissions: ['tenants.read', 'tenants.write', 'tenants.close', 'entitlements.write', 'announcements.write', 'overview.read'] };
const ORG = { id: 'c1', slug: 'acme', name: 'Acme', status: 'active', plan_key: 'professional', members_total: 10, members_active: 8, members_count: 10, products: ['people'], tags: [], trial_ends_at: null, last_activity_at: null, entitlements: [] };

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
  await page.route('**/operator/v1/me', (route) => fulfillJson(route, { success: true, data: ME }));
  await page.route('**/operator/v1/plans', (route) => fulfillJson(route, { success: true, data: [{ key: 'professional', name: 'Professional', products: ['people'] }] }));
  await page.route('**/operator/v1/orgs?**', (route) => fulfillJson(route, { success: true, data: [ORG], meta: { total: 1, next_cursor: null } }));
});

test('suspend needs the slug and a reason, and sends both', async ({ page }) => {
  let body: any;
  await page.route('**/operator/v1/orgs/c1/suspend', (route) => { body = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: ORG }); });
  await page.goto('/operator/organizations');
  await page.getByRole('button', { name: 'Suspend' }).click();
  const confirm = page.getByRole('button', { name: 'Suspend', exact: true }).last();
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Reason/).fill('billing hold');
  await expect(confirm).toBeDisabled();
  await page.locator('#confirm-require-text').fill('acme');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect.poll(() => body).toEqual({ reason: 'billing hold', confirm_slug: 'acme' });
});

test('create organization runs in three steps', async ({ page }) => {
  let body: any;
  await page.route('**/operator/v1/orgs', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    body = route.request().postDataJSON();
    return fulfillJson(route, { success: true, data: { invite_email_sent: true } }, 201);
  });
  await page.goto('/operator/organizations');
  await page.getByRole('button', { name: /Create|New|Add/ }).first().click();
  await expect(page.getByText('step 1 of 3')).toBeVisible();
  await page.getByPlaceholder('Organization name').fill('Globex');
  await page.getByLabel('Plan').selectOption('professional');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('step 2 of 3')).toBeVisible();
  await page.getByPlaceholder('First admin full name').fill('Ada Admin');
  await page.getByPlaceholder('First admin email').fill('ada@globex.test');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('step 3 of 3')).toBeVisible();
  await expect(page.getByText('ada@globex.test', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(() => body).toMatchObject({ name: 'Globex', plan_key: 'professional', first_admin: { email: 'ada@globex.test', full_name: 'Ada Admin' } });
});

test('publish an announcement from the overview', async ({ page }) => {
  let body: any;
  await page.route('**/operator/v1/overview', (route) => fulfillJson(route, { success: true, data: { tenants: { error: true }, members_active: 0, health: { error: true }, attention: { error: true }, activity: [] } }));
  await page.route('**/operator/v1/announcement', (route) => {
    if (route.request().method() === 'PUT') { body = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { id: 'a1', ...body } }); }
    return fulfillJson(route, { success: true, data: null });
  });
  await page.goto('/operator/overview');
  await page.getByRole('button', { name: 'Announcement' }).click();
  await page.getByLabel('Message').fill('Maintenance tonight');
  await page.getByLabel('Severity').selectOption('warning');
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect.poll(() => body).toMatchObject({ message: 'Maintenance tonight', severity: 'warning' });
});
