// Plan 04 C2: the invited operator's accept page. API mocked with page.route; no operator session exists.
import { test, expect, type Page } from '@playwright/test';

const VERIFY = '**/operator/v1/invite/verify';
const ACCEPT = '**/operator/v1/invite/accept';
const PENDING = { success: true, data: { email: 'new.op@karbexa.test', full_name: 'New Op', roles: ['support'], expires_at: '2026-12-01T10:00:00.000Z' } };

const answer = (page: Page, url: string, status: number, body: unknown) =>
  page.route(url, (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test('pending: shows the invited e-mail read-only and the role, without redirecting to operator sign-in', async ({ page }) => {
  await answer(page, VERIFY, 200, PENDING);
  await page.goto('/operator/accept-invite?token=abc');
  await expect(page.getByTestId('op-invite-form')).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveValue('new.op@karbexa.test');
  await expect(page.getByText('Role: Support')).toBeVisible();
  expect(page.url()).toContain('/operator/accept-invite');
});

test('a short password is refused in the form; a valid one sets the password and offers sign-in', async ({ page }) => {
  await answer(page, VERIFY, 200, PENDING);
  let sent: any = null;
  await page.route(ACCEPT, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { email: 'new.op@karbexa.test', mfa_enrolment_required: true } }) });
  });
  await page.goto('/operator/accept-invite?token=abc');
  await page.getByLabel('New password').fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('Use at least 12 characters')).toBeVisible();
  expect(sent).toBeNull();

  await page.getByLabel('New password').fill('Correct-Horse-Battery-9');
  await page.getByLabel('Confirm password').fill('Correct-Horse-Battery-9');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByTestId('op-invite-done')).toContainText('authenticator app');
  await expect(page.getByRole('button', { name: 'Sign in to the Command Center' })).toBeVisible();
  expect(sent).toEqual({ token: 'abc', password: 'Correct-Horse-Battery-9' });
});

test('used in another tab between verify and submit: the late answer shows "Already set up"', async ({ page }) => {
  await answer(page, VERIFY, 200, PENDING);
  await answer(page, ACCEPT, 409, { success: false, error: 'used', code: 'INVITE_ALREADY_USED' });
  await page.goto('/operator/accept-invite?token=abc');
  await page.getByLabel('New password').fill('Correct-Horse-Battery-9');
  await page.getByLabel('Confirm password').fill('Correct-Horse-Battery-9');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByTestId('op-invite-used')).toBeVisible();
});

for (const [code, status, testId] of [
  ['INVITE_EXPIRED', 410, 'op-invite-expired'],
  ['INVITE_SUPERSEDED', 410, 'op-invite-superseded'],
  ['INVITE_REVOKED', 410, 'op-invite-revoked'],
  ['INVITE_NOT_FOUND', 404, 'op-invite-not-found'],
] as const) {
  test(`${code}: shows its own message`, async ({ page }) => {
    await answer(page, VERIFY, status, { success: false, error: code, code });
    await page.goto('/operator/accept-invite?token=abc');
    await expect(page.getByTestId(testId)).toBeVisible();
  });
}

test('no token: "not valid" without calling the API', async ({ page }) => {
  let called = false;
  await page.route(VERIFY, (route) => { called = true; return route.abort(); });
  await page.goto('/operator/accept-invite');
  await expect(page.getByTestId('op-invite-not-found')).toBeVisible();
  expect(called).toBe(false);
});
