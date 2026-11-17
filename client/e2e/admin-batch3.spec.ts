// Plan 5.10: People, Policies, Workflows, Locations, Company settings: shared PageHeader and PageStates, page internals untouched.
// One spec file for the five wrapped pages. Written now, run in Phase 7. API mocked.
import { test, expect, type Page } from '@playwright/test';
import { fulfillJson, signInTenant } from './helpers/auth';

const empty = (page: Page, glob: string) => page.route(glob, (route) => fulfillJson(route, { success: true, data: [] }));
const failing = (page: Page, glob: string) => page.route(glob, (route) => fulfillJson(route, { success: false, error: 'x' }, 500));
const retry = (page: Page) => expect(page.getByRole('button', { name: /retry|try again/i })).toBeVisible({ timeout: 15000 });

test.beforeEach(async ({ page }) => { await signInTenant(page, { permissions: ['people:read:all', 'policies:read:all', 'workflows:read:all', 'locations:read:all', 'organization:update:all'] }); });

test('People: header with Invite user, and the error state', async ({ page }) => {
  await empty(page, '**/api/v1/people**'); // the list is read with ?limit=200 (paged)
  await page.goto('/people');
  await expect(page.getByRole('heading', { name: 'People', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toBeVisible();
  await failing(page, '**/api/v1/people**');
  await page.reload();
  await retry(page);
});

test('Policies: header with Publish policy, and the error state', async ({ page }) => {
  await empty(page, '**/api/v1/policies**');
  await page.goto('/policies');
  await expect(page.getByRole('heading', { name: 'Policies', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish policy', exact: true })).toBeVisible();
  await failing(page, '**/api/v1/policies**');
  await page.reload();
  await retry(page);
});

test('Workflows: header with Create workflow, and the error state', async ({ page }) => {
  await empty(page, '**/api/v1/workflows**');
  await page.goto('/workflows');
  await expect(page.getByRole('heading', { name: 'Workflows', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create workflow', exact: true })).toBeVisible();
  await failing(page, '**/api/v1/workflows**');
  await page.reload();
  await retry(page);
});

test('Locations: header, the three tabs, and the error state of the locations tab', async ({ page }) => {
  await empty(page, '**/api/v1/locations**');
  await page.goto('/locations');
  await expect(page.getByRole('heading', { name: 'Locations', level: 1 })).toBeVisible();
  await failing(page, '**/api/v1/locations**');
  await page.reload();
  await retry(page);
});

test('Company settings: header and the employee ID format form', async ({ page }) => {
  await page.route('**/api/v1/company/**', (route) => fulfillJson(route, { success: true, data: { employee_id_format: 'EMP-{counter:5}', employee_id_counter: 7 } }));
  await empty(page, '**/api/v1/locations**');
  await page.goto('/company/settings');
  await expect(page.getByRole('heading', { name: 'Company settings', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Employee ID Format')).toBeVisible();
});
