// Plan 5.8: Audit log on ListPage; export controls follow audit_logs:export (5.3). Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const PAGE = { events: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };

test('export buttons show for audit_logs:export:all', async ({ page }) => {
  await signInTenant(page, { permissions: ['audit_logs:read:all', 'audit_logs:export:all'] });
  await page.route('**/api/v1/audit-logs**', (route) => fulfillJson(route, { success: true, data: PAGE }));
  await page.goto('/audit-logs');
  await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
});

test('without the export permission the buttons are hidden', async ({ page }) => {
  await signInTenant(page, { permissions: ['audit_logs:read:all'] });
  await page.route('**/api/v1/audit-logs**', (route) => fulfillJson(route, { success: true, data: PAGE }));
  await page.goto('/audit-logs');
  await expect(page.getByRole('button', { name: 'CSV' })).toHaveCount(0);
});

test('a failed load shows the error state with a retry', async ({ page }) => {
  await signInTenant(page, { permissions: ['audit_logs:read:all'] });
  await page.route('**/api/v1/audit-logs**', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/audit-logs');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
