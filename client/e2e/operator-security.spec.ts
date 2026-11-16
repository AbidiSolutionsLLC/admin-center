// Plan 4.11: Security page, operator sessions and operator invite. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const SECURITY = {
  operators_without_mfa: [{ id: 'o2', email: 'nomfa@karbexa.test', full_name: 'No Mfa', roles: ['support'] }],
  failed_sign_ins: { count: 3, recent: [{ email: 'op@karbexa.test', event_type: 'login_failure', ip: '10.0.0.9', at: '2026-11-16T11:00:00.000Z' }] },
  locked_accounts: [],
  active_sessions: [{ id: 's1', operator_id: 'o1', operator_email: 'op@karbexa.test', ip: '10.0.0.1', user_agent: null, created_at: '2026-11-16T10:00:00.000Z', last_seen_at: '2026-11-16T11:30:00.000Z' }],
  tenants_without_mfa: [{ company_id: 'c1', summary: 'Acme: 2 admin(s) without MFA', link: '/operator/organizations/c1?tab=admins' }],
  recent_role_changes: [{ id: 'r1', by: 'op@karbexa.test', action: 'operator.invited', target_id: 'o2', at: '2026-11-16T09:00:00.000Z' }],
};

test.beforeEach(async ({ page }) => { await signInOperator(page); });

test('security blocks and session revoke', async ({ page }) => {
  let revoked = false;
  await page.route('**/operator/v1/security', (route) => fulfillJson(route, { success: true, data: SECURITY }));
  await page.route('**/operator/v1/operators/o1/sessions/s1', (route) => { revoked = true; return fulfillJson(route, { success: true, data: { revoked: true } }); });
  await page.goto('/operator/security');
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();
  await expect(page.getByText('nomfa@karbexa.test')).toBeVisible();
  await expect(page.getByText('Acme: 2 admin(s) without MFA')).toBeVisible();
  await expect(page.getByText('No account is locked.')).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await expect.poll(() => revoked).toBe(true);
});

test('a failed block shows its own error only', async ({ page }) => {
  await page.route('**/operator/v1/security', (route) => fulfillJson(route, { success: true, data: { ...SECURITY, failed_sign_ins: { error: true } } }));
  await page.goto('/operator/security');
  await expect(page.getByText('This section could not be loaded.')).toBeVisible();
  await expect(page.getByText('nomfa@karbexa.test')).toBeVisible();
});

test('invite an operator with a role', async ({ page }) => {
  let body: any;
  await page.route('**/operator/v1/operators', (route) => fulfillJson(route, { success: true, data: [{ id: 'o1', email: 'op@karbexa.test', full_name: 'Op', status: 'active', roles: ['platform_admin'] }] }));
  await page.route('**/operator/v1/operators/invite', (route) => { body = route.request().postDataJSON(); return fulfillJson(route, { success: true, data: { id: 'o9' } }, 201); });
  await page.goto('/operator/operators');
  await page.getByRole('button', { name: 'Invite operator' }).click();
  await page.getByPlaceholder('Full name').fill('New Op');
  await page.getByPlaceholder('Email').fill('newop@karbexa.test');
  await page.getByLabel('Role').selectOption('auditor');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect.poll(() => body).toEqual({ email: 'newop@karbexa.test', full_name: 'New Op', roles: ['auditor'] });
});
