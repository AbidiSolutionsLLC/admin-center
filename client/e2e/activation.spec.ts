// Plan 2.3: the activation page and its six states. Written now, run in Phase 7.
// Needs the Playwright setup from task 3.8 (@playwright/test, playwright.config.ts, `npm run test:e2e`); until then it is
// not picked up by any runner. The API is mocked with page.route, so the spec needs only the Vite dev server.
import { test, expect, type Page } from '@playwright/test';

const VERIFY = '**/api/v1/people/verify-invite';
const RENEW = '**/api/v1/people/renew-invite';
const SETUP = '**/api/v1/auth/setup-password';

const answer = (page: Page, status: number, body: unknown) =>
  page.route(VERIFY, (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }));

test('pending: the form shows the e-mail read-only and the organisation', async ({ page }) => {
  await answer(page, 200, { success: true, data: { email: 'new.hire@acme.test', full_name: 'New Hire', company_id: 'c1', company_name: 'Acme', kind: 'member' } });
  await page.goto('/onboarding?token=abc');
  await expect(page.getByTestId('invite-form')).toBeVisible();
  const email = page.getByLabel('Email Address');
  await expect(email).toHaveValue('new.hire@acme.test');
  await expect(email).toHaveAttribute('readonly', '');
  await expect(page.getByText('Joining Acme')).toBeVisible();
});

test('expired: shows the date and a working "Send me a new link"', async ({ page }) => {
  await answer(page, 410, { success: false, error: 'expired', code: 'INVITE_EXPIRED', data: { at: '2026-11-01T10:00:00.000Z' } });
  let renewed = false;
  await page.route(RENEW, (route) => { renewed = true; return route.fulfill({ status: 202, contentType: 'application/json', body: '{"success":true}' }); });
  await page.goto('/onboarding?token=abc');
  await expect(page.getByTestId('invite-expired')).toContainText('This link expired on');
  await page.getByRole('button', { name: 'Send me a new link' }).click();
  await expect(page.getByTestId('invite-renewed')).toBeVisible();
  expect(renewed).toBe(true);
});

test('superseded: tells the user to use the latest e-mail and offers a new link', async ({ page }) => {
  await answer(page, 410, { success: false, error: 'superseded', code: 'INVITE_SUPERSEDED', data: { at: '2026-11-10T09:00:00.000Z' } });
  await page.goto('/onboarding?token=abc');
  await expect(page.getByTestId('invite-superseded')).toContainText('Use the latest e-mail');
  await expect(page.getByRole('button', { name: 'Send me a new link' })).toBeVisible();
});

test('already used: offers Sign in', async ({ page }) => {
  await answer(page, 409, { success: false, error: 'used', code: 'INVITE_ALREADY_USED' });
  await page.goto('/onboarding?token=abc');
  await expect(page.getByTestId('invite-used')).toContainText('This account is already set up.');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('revoked: says contact your administrator and offers no new link', async ({ page }) => {
  await answer(page, 410, { success: false, error: 'revoked', code: 'INVITE_REVOKED' });
  await page.goto('/onboarding?token=abc');
  await expect(page.getByTestId('invite-revoked')).toContainText('Contact your administrator');
  await expect(page.getByRole('button', { name: 'Send me a new link' })).toHaveCount(0);
});

test('not found: unknown token and a missing token both show the invalid-link message', async ({ page }) => {
  await answer(page, 404, { success: false, error: 'nf', code: 'INVITE_NOT_FOUND' });
  await page.goto('/onboarding?token=zzz');
  await expect(page.getByTestId('invite-not-found')).toContainText('Check that you copied the whole link.');
  await page.goto('/onboarding');
  await expect(page.getByTestId('invite-not-found')).toBeVisible();
});

test('the link is used in another tab: submitting shows the already-used notice', async ({ page }) => {
  await answer(page, 200, { success: true, data: { email: 'a@acme.test', full_name: 'A', company_id: 'c1', company_name: 'Acme', kind: 'member' } });
  await page.route(SETUP, (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'used', code: 'INVITE_ALREADY_USED' }) }));
  await page.goto('/onboarding?token=abc');
  await page.getByLabel('New Password').fill('Str0ng-Passw0rd!');
  await page.getByLabel('Confirm Password').fill('Str0ng-Passw0rd!');
  await page.getByRole('button', { name: 'Set Password & Activate' }).click();
  await expect(page.getByTestId('invite-used')).toBeVisible();
});
