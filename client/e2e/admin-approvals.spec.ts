// Plan 5.8: Approvals on ListPage: populated, empty, error. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['workflows:read:all'] }); });

test('lists pending approvals and filters by search', async ({ page }) => {
  await page.route('**/api/v1/approvals/pending', (route) => fulfillJson(route, {
    success: true,
    data: [
      { _id: 'a1', workflow_run_id: { _id: 'run-100' }, workflow_step_id: { name: 'Manager sign-off' }, created_at: '2026-11-16T09:00:00Z' },
      { _id: 'a2', workflow_run_id: { _id: 'run-200' }, workflow_step_id: { name: 'Finance check' }, created_at: '2026-11-16T09:30:00Z' },
    ],
  }));
  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: 'Pending approvals', level: 1 })).toBeVisible();
  await expect(page.getByText('run-100')).toBeVisible();
  await page.getByRole('searchbox', { name: /search/i }).fill('Finance');
  await expect(page.getByText('run-100')).toHaveCount(0);
  await expect(page.getByText('run-200')).toBeVisible();
});

test('empty state', async ({ page }) => {
  await page.route('**/api/v1/approvals/pending', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/approvals');
  await expect(page.getByText('No pending approvals')).toBeVisible();
});

test('error state offers a retry', async ({ page }) => {
  await page.route('**/api/v1/approvals/pending', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/approvals');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
