// Plan 7.5: Operators page main path (list, invite, suspend, sessions). API mocked (see helpers/auth.ts).
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const OPS = [
  { id: 'o1', email: 'op@karbexa.test', full_name: 'Op One', roles: ['platform_admin'], status: 'active' },
  { id: 'o2', email: 'sup@karbexa.test', full_name: 'Sue Support', roles: ['support'], status: 'active' },
];

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
  await page.route('**/operator/v1/operators', (route) => (route.request().method() === 'GET' ? fulfillJson(route, { success: true, data: OPS }) : route.fallback()));
});

test('lists operators; invite sends name, email and role', async ({ page }) => {
  let body: any;
  await page.route('**/operator/v1/operators/invite', (route) => { body = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { id: 'o3' } }, 201); });
  await page.goto('/operator/operators');
  await expect(page.getByRole('heading', { name: 'Operators', level: 1 })).toBeVisible();
  await expect(page.getByRole('row', { name: /Sue Support/ })).toContainText('sup@karbexa.test');
  await page.getByRole('button', { name: 'Invite operator' }).click();
  await page.getByPlaceholder('Full name').fill('New Auditor');
  await page.getByPlaceholder('Email').fill('new@karbexa.test');
  await page.getByLabel('Role').selectOption('auditor');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect.poll(() => body).toMatchObject({ email: 'new@karbexa.test', full_name: 'New Auditor', roles: ['auditor'] });
});

test('suspend sends status; sessions dialog lists sessions', async ({ page }) => {
  let patch: any;
  await page.route('**/operator/v1/operators/o2', (route) => { patch = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { ...OPS[1], status: 'suspended' } }); });
  await page.route('**/operator/v1/operators/o2/sessions', (route) => fulfillJson(route, { success: true, data: [{ id: 's1', ip: '10.0.0.5', created_at: '2026-11-16T10:00:00.000Z', active: true }] }));
  await page.goto('/operator/operators');
  const row = page.getByRole('row', { name: /Sue Support/ });
  await row.getByRole('button', { name: 'Sessions' }).click();
  await expect(page.getByText('10.0.0.5')).toBeVisible();
  await page.keyboard.press('Escape');
  await row.getByRole('button', { name: 'Suspend' }).click();
  // Suspending is confirmed first; nothing is sent until then.
  const dialog = page.getByRole('dialog', { name: /Suspend Sue Support/ });
  await expect(dialog).toContainText('cannot sign in until you reactivate');
  expect(patch).toBeUndefined();
  await dialog.getByRole('button', { name: 'Suspend', exact: true }).click();
  await expect.poll(() => patch).toMatchObject({ status: 'suspended' });
});

test('the list shows each operator\'s role', async ({ page }) => {
  await page.goto('/operator/operators');
  await expect(page.getByRole('row', { name: /Sue Support/ })).toContainText('support');
  await expect(page.getByRole('row', { name: /Op One/ })).toContainText('platform admin');
});

test('a read-only operator sees no write buttons', async ({ page }) => {
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o9', email: 'aud@karbexa.test', roles: ['auditor'], status: 'active', permissions: ['operators.read'] } }));
  await page.goto('/operator/operators');
  await expect(page.getByRole('row', { name: /Sue Support/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite operator' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
});
