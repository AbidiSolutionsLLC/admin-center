// Sign-in helpers for the two realms (plan 3.8).
//
// The client signs in with OIDC Authorization Code + PKCE and keeps tokens in memory only, so a test cannot
// pre-load a session. Instead the helpers answer the identity provider's two endpoints with page.route and let the
// app run its real flow: authorize -> 302 to the callback with the app's own `state` -> token exchange -> profile.
// Everything is mocked; no backend is needed. Call the helper BEFORE page.goto.
import type { Page, Route } from '@playwright/test';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

/** Fulfil a route with JSON (and permissive CORS: the API origin differs from the page origin). */
export const fulfillJson = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

const TOKENS = { access_token: 'test-access', refresh_token: 'test-refresh', id_token: 'test-id', expires_in: 3600 };

async function mockIdp(page: Page, realm: 'tenant' | 'operator', callbackPath: string) {
  await page.route(`**/realms/${realm}/oauth/authorize*`, (route) => {
    const q = new URL(route.request().url()).searchParams;
    const redirect = new URL(q.get('redirect_uri') ?? '');
    redirect.pathname = callbackPath;
    redirect.searchParams.set('code', 'test-code');
    redirect.searchParams.set('state', q.get('state') ?? '');
    return route.fulfill({ status: 302, headers: { location: redirect.toString() } });
  });
  await page.route(`**/realms/${realm}/oauth/token`, (route) => fulfillJson(route, TOKENS));
}

export interface TenantUser {
  role?: string;
  /** Permission keys the user holds, for example 'audit:read:all'. */
  permissions?: string[];
}

/** Tenant realm (Admin Center): signs in as a user with the given role and permissions. */
export async function signInTenant(page: Page, user: TenantUser = {}) {
  const role = user.role ?? 'super_admin';
  await mockIdp(page, 'tenant', '/auth/callback');
  await page.route('**/api/v1/auth/me', (route) =>
    fulfillJson(route, { success: true, data: { user: { _id: 'u1', company_id: 'c1', role, email: 'admin@acme.test', full_name: 'Test Admin' } } })
  );
  await page.route('**/api/v1/auth/my-permissions', (route) =>
    fulfillJson(route, {
      success: true,
      data: {
        user_id: 'u1',
        company_id: 'c1',
        roles: [],
        permissions: Object.fromEntries((user.permissions ?? []).map((p) => [p, true])),
      },
    })
  );
  // The shell polls these; an empty answer keeps it quiet.
  await page.route('**/api/v1/notifications**', (route) => fulfillJson(route, { success: true, data: [], count: 0 }));
  await page.route('**/api/v1/me/apps', (route) => fulfillJson(route, { success: true, data: [] }));
}

/** Operator realm (Command Center): signs in as a platform operator. */
export async function signInOperator(page: Page) {
  await mockIdp(page, 'operator', '/operator/callback');
}
