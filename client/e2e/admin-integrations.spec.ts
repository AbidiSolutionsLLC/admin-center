// Plan 5.8: Integrations on PageHeader + PageStates. Written now, run in Phase 7. API mocked.
import { test, expect } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['integrations:read:all'] }); });

test('shows the three connectors and the empty hint when none is connected', async ({ page }) => {
  await page.route('**/api/v1/integrations', (route) => fulfillJson(route, { success: true, data: [] }));
  await page.goto('/integrations');
  await expect(page.getByRole('heading', { name: 'Integrations', level: 1 })).toBeVisible();
  for (const name of ['Slack', 'Jira', 'Google Workspace']) await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText('No integrations connected')).toBeVisible();
});

test('error state offers a retry', async ({ page }) => {
  await page.route('**/api/v1/integrations', (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
  await page.goto('/integrations');
  await expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible();
});
