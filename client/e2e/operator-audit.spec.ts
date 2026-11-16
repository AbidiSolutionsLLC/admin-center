// Plan 3.8 / 3.6: reference page "Audit" on ListPage + Drawer. Written now, run in Phase 7. API mocked (see helpers/auth.ts).
import { test, expect } from '@playwright/test';
import { fulfillJson, signInOperator } from './helpers/auth';

const AUDIT = '**/operator/v1/audit**';
const entry = (id: string, action: string) => ({
  id,
  action,
  operator_id: 'o1',
  operator_email: 'op@karbexa.test',
  target_type: 'org',
  target_id: 'c1',
  company_id: 'c1',
  details: { reason: 'test' },
  correlation_id: `corr-${id}`,
  created_at: '2026-11-16T10:00:00.000Z',
});

test.beforeEach(async ({ page }) => {
  await signInOperator(page);
});

test('populated: rows, row click opens the drawer, Esc closes it, the URL follows', async ({ page }) => {
  await page.route(AUDIT, (route) =>
    fulfillJson(route, { success: true, data: [entry('a1', 'org.suspend'), entry('a2', 'plan.save')], meta: { next_cursor: null } })
  );
  await page.goto('/operator/audit');
  await expect(page.getByRole('heading', { name: 'Audit', level: 1 })).toBeVisible();
  await page.getByRole('row', { name: /org\.suspend/ }).click();
  const drawer = page.getByRole('dialog', { name: 'org.suspend' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('corr-a1');
  await expect(drawer).toContainText('"reason": "test"');
  await expect(page).toHaveURL(/entry=a1/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/entry=/);
});

test('deep link: ?entry= opens the drawer on load', async ({ page }) => {
  await page.route(AUDIT, (route) => fulfillJson(route, { success: true, data: [entry('a1', 'org.suspend')], meta: { next_cursor: null } }));
  await page.goto('/operator/audit?entry=a1');
  await expect(page.getByRole('dialog', { name: 'org.suspend' })).toBeVisible();
});

test('paging: Next asks for the next cursor, Previous goes back', async ({ page }) => {
  const cursors: Array<string | null> = [];
  await page.route(AUDIT, (route) => {
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    return cursor
      ? fulfillJson(route, { success: true, data: [entry('b1', 'second.page')], meta: { next_cursor: null } })
      : fulfillJson(route, { success: true, data: [entry('a1', 'first.page')], meta: { next_cursor: 'cur-1' } });
  });
  await page.goto('/operator/audit');
  await expect(page.getByRole('row', { name: /first\.page/ })).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByRole('row', { name: /second\.page/ })).toBeVisible();
  expect(cursors).toContain('cur-1');
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(page.getByRole('row', { name: /first\.page/ })).toBeVisible();
});

test('filter: the action box is kept in the URL and sent to the API', async ({ page }) => {
  const actions: Array<string | null> = [];
  await page.route(AUDIT, (route) => {
    actions.push(new URL(route.request().url()).searchParams.get('action'));
    return fulfillJson(route, { success: true, data: [entry('a1', 'org.suspend')], meta: { next_cursor: null } });
  });
  await page.goto('/operator/audit');
  await page.getByLabel('Filter by exact action').fill('org.suspend');
  await expect(page).toHaveURL(/action=org\.suspend/);
  await expect.poll(() => actions).toContain('org.suspend');
});

test('empty and error states', async ({ page }) => {
  await page.route(AUDIT, (route) => fulfillJson(route, { success: true, data: [], meta: { next_cursor: null } }));
  await page.goto('/operator/audit');
  await expect(page.getByText('No audit entries yet')).toBeVisible();

  await page.unroute(AUDIT);
  await page.route(AUDIT, (route) => fulfillJson(route, { success: false, error: 'boom' }, 500));
  await page.reload();
  await expect(page.getByText('Failed to load data')).toBeVisible();
});
