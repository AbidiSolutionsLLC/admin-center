// Plan 2.4: the invitation panel on the member detail page. Written now, run in Phase 7.
// Needs the Playwright setup and the tenant sign-in helper from task 3.8. The member and invitation endpoints are mocked.
import { test, expect } from '@playwright/test';
import { signInTenant } from './helpers/auth';

const USER_ID = '64b000000000000000000001';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.beforeEach(async ({ page }) => {
  await signInTenant(page, { permissions: ['people:read:all'] });
  await page.route(`**/api/v1/people/${USER_ID}`, (route) => route.fulfill(json({
    success: true,
    data: { _id: USER_ID, full_name: 'Panel Member', email: 'panel@acme.test', lifecycle_state: 'invited', employment_type: 'full_time' },
  })));
});

test('shows state, last send, and a failed delivery with its error', async ({ page }) => {
  await page.route(`**/api/v1/people/${USER_ID}/invitation`, (route) => route.fulfill(json({
    success: true,
    data: {
      invitation: { id: 'i1', kind: 'member', state: 'pending', created_at: '2026-11-16T09:00:00Z', last_sent_at: '2026-11-16T09:00:00Z', sent_count: 1, expires_at: '2026-11-19T09:00:00Z', accepted_at: null, revoked_at: null },
      delivery: { status: 'failed', attempts: 5, last_error: 'ECONNREFUSED: smtp down', sent_at: null, queued_at: '2026-11-16T09:00:00Z' },
    },
  })));
  await page.goto(`/people/${USER_ID}`);
  await expect(page.getByTestId('invitation-state')).toHaveText('Pending');
  await expect(page.getByTestId('invitation-delivery')).toHaveText('Failed');
  await expect(page.getByTestId('invitation-error')).toContainText('ECONNREFUSED: smtp down');
});

test('Copy link asks first, then shows the link once', async ({ page }) => {
  await page.route(`**/api/v1/people/${USER_ID}/invitation`, (route) => route.fulfill(json({
    success: true,
    data: { invitation: { id: 'i1', kind: 'member', state: 'pending', created_at: '2026-11-16T09:00:00Z', last_sent_at: '2026-11-16T09:00:00Z', sent_count: 1, expires_at: '2026-11-19T09:00:00Z', accepted_at: null, revoked_at: null }, delivery: null },
  })));
  let copied = false;
  await page.route(`**/api/v1/people/${USER_ID}/resend-invite?copy=true`, (route) => {
    copied = true;
    return route.fulfill(json({ success: true, data: { invite_link: 'https://admin.test/onboarding?token=abc&email=panel%40acme.test' } }));
  });
  await page.goto(`/people/${USER_ID}`);
  await page.getByRole('button', { name: 'Copy link' }).click();
  expect(copied).toBe(false); // nothing happens until the dialog is confirmed
  await page.getByRole('button', { name: 'Create and copy' }).click();
  await expect(page.getByLabel('Invitation link')).toHaveValue(/onboarding\?token=abc/);
});

test('Revoke asks first, then calls the revoke endpoint', async ({ page }) => {
  await page.route(`**/api/v1/people/${USER_ID}/invitation`, (route) => route.fulfill(json({
    success: true,
    data: { invitation: { id: 'i1', kind: 'member', state: 'pending', created_at: '2026-11-16T09:00:00Z', last_sent_at: '2026-11-16T09:00:00Z', sent_count: 1, expires_at: '2026-11-19T09:00:00Z', accepted_at: null, revoked_at: null }, delivery: null },
  })));
  let revoked = false;
  await page.route(`**/api/v1/people/${USER_ID}/invitation/revoke`, (route) => { revoked = true; return route.fulfill(json({ success: true })); });
  await page.goto(`/people/${USER_ID}`);
  await page.getByRole('button', { name: 'Revoke' }).click();
  expect(revoked).toBe(false);
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect.poll(() => revoked).toBe(true);
});
