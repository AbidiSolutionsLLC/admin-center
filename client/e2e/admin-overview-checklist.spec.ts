// Plan 5.7: setup checklist on Overview: shows open steps, can be skipped, hidden when complete. Written now, run in Phase 7. API mocked.
import { test, expect, type Page } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const progress = (done: boolean[]) => ({
  overall_percentage: 50, modules: [], total_checks: 4, completed_checks: 2,
  checklist: ['organization', 'security_policy', 'invite_people', 'assign_apps'].map((key, i) => ({ key, label: `Step ${key}`, done: done[i], href: `/${key}` })),
});

async function mock(page: Page, done: boolean[]) {
  await signInTenant(page);
  await page.route('**/api/v1/overview/setup-progress', (route) => fulfillJson(route, { success: true, data: progress(done) }));
  await page.route('**/api/v1/overview/**', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.route('**/api/v1/overview/stats', (route) => fulfillJson(route, { success: true, data: { users: { total: 0, active: 0, invited: 0 }, departments: { total: 0, active: 0, invited: 0 }, apps: { total: 0, active: 0, invited: 0 }, roles: { total: 0, active: 0, invited: 0 } } }));
  await page.route('**/api/v1/overview/setup-progress', (route) => fulfillJson(route, { success: true, data: progress(done) }));
}

test('open steps are listed with links and done steps are struck', async ({ page }) => {
  await mock(page, [true, false, false, false]);
  await page.goto('/overview');
  await expect(page.getByTestId('setup-checklist')).toContainText('1 of 4 steps done');
  await expect(page.getByTestId('checklist-organization')).toHaveAttribute('data-done', 'true');
  await expect(page.getByRole('link', { name: 'Step invite_people' })).toBeVisible();
});

test('Skip for now hides it', async ({ page }) => {
  await mock(page, [true, false, false, false]);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByTestId('setup-checklist')).toHaveCount(0);
});

test('a complete checklist is not shown', async ({ page }) => {
  await mock(page, [true, true, true, true]);
  await page.goto('/overview');
  await expect(page.getByTestId('setup-checklist')).toHaveCount(0);
});
