import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '../playwright/.auth/user.json');
const APP_URL = 'http://localhost:5173';
/**
 * Seed credentials — matches seed-first-user.ts:
 *   email: tsaleem@abidisolutions.com
 *   password: Mtayyab595*
 *
 * The seed-first-user script creates this user with Super Admin role.
 * Run seed scripts before executing this auth setup:
 *   cd server && npx ts-node src/scripts/seed-first-user.ts
 */
const TEST_EMAIL = 'tsaleem@abidisolutions.com';
const TEST_PASSWORD = 'Mtayyab595*';

setup('authenticate', async ({ page }) => {
  console.log('🔐 Auth setup: navigating to login page...');

  // 1. Navigate to the login page
  await page.goto(`${APP_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  console.log('🔐 Login page loaded.');

  // 2. Fill credentials
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  console.log('🔐 Credentials filled.');

  // 3. Submit the login form
  await page.click('button[type="submit"]');

  // 4. Wait for successful login — app navigates to /overview
  await page.waitForURL('**/overview', { timeout: 20_000 });
  console.log(`✅ Login successful. Current URL: ${page.url()}`);

  // 5. The app now has the access token in the Zustand store (in-memory).
  //    Playwright's storageState captures cookies (including the httpOnly
  //    refreshToken cookie) and localStorage. The Zustand store itself is
  //    NOT persisted, so tests will need to handle re-authentication.
  //
  //    We also store the auth state into localStorage as a fallback bridge.
  await page.evaluate(() => {
    // Traverse the React fiber tree to locate the Zustand store and
    // persist its auth payload into localStorage so it survives the
    // storageState serialization round-trip.
    const root = document.getElementById('root');
    if (!root) return;

    const fiberKey = Object.keys(root).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'),
    );
    if (!fiberKey) return;

    let fiber = root[fiberKey];
    let depth = 0;
    const maxDepth = 3000;

    while (fiber && depth < maxDepth) {
      depth++;
      const memoizedState = fiber.memoizedState;
      if (memoizedState) {
        let queue = memoizedState;
        while (queue) {
          const st = queue.memoizedState;
          if (
            st &&
            typeof st === 'object' &&
            'accessToken' in st &&
            'userRole' in st &&
            st.accessToken
          ) {
            localStorage.setItem(
              'playwright_auth',
              JSON.stringify({
                accessToken: st.accessToken,
                userRole: st.userRole,
                userId: st.userId,
                companyId: st.companyId,
                userEmail: st.userEmail,
                userName: st.userName,
              }),
            );
            console.log(
              '🔐 Auth state written to localStorage for Playwright.',
            );
            return;
          }
          queue = queue.next;
        }
      }
      fiber = fiber.child || fiber.sibling;
    }

    console.warn(
      '⚠️  Could not locate Zustand auth store in React fiber tree. Tests may need manual login fallback.',
    );
  });

  // 6. Save storage state — this captures:
  //    - httpOnly refreshToken cookie
  //    - localStorage (including the playwright_auth we just set)
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`✅ Auth storage state saved to ${AUTH_FILE}`);
});
