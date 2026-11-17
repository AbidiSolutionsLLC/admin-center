// Plan 5.8: Security page on PageHeader + URL-synced Tabs; Active sessions (5.2). Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['security:read:all'] }); });

test('the five tabs are present and the active one is kept in the URL', async ({ page }) => {
  await page.route('**/api/v1/security/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.route('**/api/v1/security/events**', (route) => fulfillJson(route, { success: true, data: { events: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } } }));
  await page.goto('/security?tab=access-log');
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();
  for (const name of ['Security policy', 'Identity providers', 'IP restrictions', 'Access log', 'Active sessions']) {
    await expect(page.getByRole('tab', { name })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: 'Access log' })).toHaveAttribute('data-state', 'active');
});

test('Active sessions lists a live session and terminates it after confirmation', async ({ page }) => {
  let deleted = false;
  await page.route('**/api/v1/security/sessions**', (route) => {
    if (route.request().method() === 'DELETE') { deleted = true; return fulfillJson(route, { success: true }); }
    return fulfillJson(route, {
      success: true,
      data: deleted ? [] : [{ _id: 'sid-1', user: { _id: 'u2', full_name: 'Sam Session', email: 'sam@acme.test' }, ip_address: '10.0.0.7', user_agent: 'smoke-agent', created_at: '2026-11-16T10:00:00Z', last_activity_at: '2026-11-16T11:00:00Z', expires_at: '2026-11-17T10:00:00Z' }],
    });
  });
  await page.goto('/security?tab=active-sessions');
  await expect(page.getByText('Sam Session')).toBeVisible();
  await page.getByTitle('Terminate Session').click();
  await page.getByRole('button', { name: 'Terminate', exact: true }).click();
  await expect.poll(() => deleted).toBe(true);
});
