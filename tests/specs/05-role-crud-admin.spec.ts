import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:5173';
const TEST_EMAIL = 'tsaleem@abidisolutions.com';
const TEST_PASSWORD = 'Mtayyab595*';

/**
 * Navigate to a protected route, handling the in-memory Zustand issue.
 *
 * PROBLEM: The app stores auth in an in-memory Zustand store (no persistence).
 * Every page.goto() is a hard reload that clears the store, so AuthGuard sees
 * accessToken=null and redirects to /login — even after a successful login.
 *
 * FIX: After login, navigate to the target page using a SIDEBAR LINK click
 * (client-side navigation via React Router) instead of page.goto(). This
 * preserves the in-memory Zustand store across the navigation.
 */
async function ensureAuthenticated(page: Page, path: string = '/roles') {
  const targetUrl = `${APP_URL}${path}`;
  await page.goto(targetUrl);
  await page.waitForTimeout(1000);

  if (page.url().includes('/login')) {
    console.log('[UI] Logging in...');

    // Navigate to login page and fill credentials
    await page.goto(`${APP_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);

    // Submit the form — use Enter key on the password field to avoid
    // Firefox-specific click interception issues with the submit button
    await page.keyboard.press('Enter');
    await page.waitForURL('**/overview', { timeout: 20000 });
    console.log('[UI] Login succeeded, at /overview.');

    // CRITICAL: Navigate client-side via sidebar link to preserve Zustand state.
    // page.goto() would trigger a hard reload and wipe the in-memory auth store.
    await page.locator('a[href="/roles"]').click();
    await page.waitForTimeout(1500);
    console.log(`[UI] Navigated to ${path} via sidebar link.`);
  }
}

function uniqueRoleName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

test.describe('Admin Role Management', () => {
  test('1. Create role via UI', async ({ page }) => {
    await ensureAuthenticated(page, '/roles');

    const roleName = uniqueRoleName('TestRole');

    await page.click('button:has-text("Create Role")');
    await expect(page.locator('text=Create Role').first()).toBeVisible({ timeout: 5000 });

    await page.fill('input[placeholder="e.g. Finance Manager"]', roleName);
    await page.fill('textarea', 'Test description');

    // Click the submit button inside the modal — scoping to [role="dialog"]
    // avoids the overlay intercepting clicks on the header button
    await page.locator('[role="dialog"] button:has-text("Create Role")').click();
    await page.waitForTimeout(2000);

    // Navigate client-side via sidebar link to preserve Zustand auth state
    await page.locator('a[href="/roles"]').click();
    await page.waitForTimeout(1500);
    await expect(page.locator(`table tbody tr:has-text("${roleName}")`)).toBeVisible({ timeout: 10000 });

    console.log(`Created role: ${roleName}`);
  });
});
