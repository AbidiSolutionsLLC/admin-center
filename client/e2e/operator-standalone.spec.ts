// WS-C C-7: "Register standalone portal" in the Command Center Products page. Written now, run in Wave 3. API mocked.
import { test, expect, type Page } from '@playwright/test';
import { ALL_OPERATOR_PERMISSIONS, fulfillJson, signInOperator } from './helpers/auth';

const PRODUCTS = [
  { product_key: 'people', name: 'People', status: 'active', category: 'talent', manifest_version: 3, icon: null, launch_url: null, roles: 5, tenants_active: 12, tenants_suspended: 1, tenants_restricted: 2 },
  { product_key: 'assets', name: 'Assets', status: 'active', category: 'it', manifest_version: 1, icon: 'package', launch_url: 'https://assets.example.com/', roles: 2, tenants_active: 0, tenants_suspended: 0, tenants_restricted: 0 },
];
const PORTAL = {
  product_key: 'assets', name: 'Assets', icon: 'package', category: 'it', status: 'active', version: 1, client_id: 'karbexa-assets', audience: 'urn:karbexa:assets',
  hosting: {
    mode: 'standalone', launch_url: 'https://assets.example.com/', health_url: null, per_tenant_launch_url: false,
    client: { type: 'confidential', token_endpoint_auth: 'client_secret_basic', redirect_uris: ['https://assets.example.com/callback'], post_logout_redirect_uris: [], backchannel_logout_uri: null, jwks_uri: null, has_secret: true, secret_set_at: '2026-11-18T10:00:00Z', previous_secret_expires_at: null },
  },
  roles: [{ key: 'asset_admin', name: 'Asset admin', rank: 40, is_default: false }, { key: 'asset_viewer', name: 'Asset viewer', rank: 10, is_default: true }],
};

async function open(page: Page, permissions = ALL_OPERATOR_PERMISSIONS) {
  await signInOperator(page, permissions);
  await page.route('**/operator/v1/products', (route) => fulfillJson(route, { success: true, data: PRODUCTS }));
  await page.route('**/operator/v1/products/standalone', (route) => fulfillJson(route, { success: true, data: [PORTAL] }));
  await page.goto('/operator/products');
}

test('a platform admin sees the register action; standalone rows are marked and offer Edit and Rotate secret', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: 'Register standalone portal' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Assets/ })).toContainText('Standalone');
  await expect(page.getByRole('row', { name: /People/ })).toContainText('Suite');
  await expect(page.getByRole('button', { name: 'Rotate secret of Assets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit People' })).toHaveCount(0);
});

test('an operator without products.write and without the platform_admin role sees no register action', async ({ page }) => {
  await signInOperator(page, ['overview.read', 'tenants.read', 'products.read', 'health.read']);
  await page.route('**/operator/v1/me', (route) =>
    fulfillJson(route, { success: true, data: { id: 'o2', email: 'sup@karbexa.test', full_name: 'Support', roles: ['support'], status: 'active', permissions: ['products.read'] } })
  );
  await page.route('**/operator/v1/products', (route) => fulfillJson(route, { success: true, data: PRODUCTS }));
  await page.route('**/operator/v1/products/standalone', (route) => fulfillJson(route, { success: true, data: [PORTAL] }));
  await page.goto('/operator/products');
  await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Register standalone portal' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /rotate secret/i })).toHaveCount(0);
});

test('the form refuses http URLs, wildcards and a missing default role before calling the API', async ({ page }) => {
  await open(page);
  let calls = 0;
  await page.route('**/operator/v1/products/zyntrus', (route) => { calls++; return fulfillJson(route, { success: true, data: {} }); });
  await page.getByRole('button', { name: 'Register standalone portal' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Zyntrus');
  await page.getByRole('textbox', { name: 'Key', exact: true }).fill('zyntrus');
  await page.getByRole('textbox', { name: 'Launch URL', exact: true }).fill('http://zyntrus.example.com/');
  await page.getByRole('textbox', { name: 'Redirect URIs', exact: true }).fill('https://*.zyntrus.example.com/cb');
  await page.getByLabel('Role 1 key').fill('recruiter');
  await page.getByLabel('Role 1 name').fill('Recruiter');
  await page.getByTestId('standalone-save').click();
  await expect(page.getByText('Launch URL must use https.')).toBeVisible();
  await expect(page.getByText(/must not contain a wildcard/)).toBeVisible();
  expect(calls).toBe(0);
});

test('registering a confidential portal sends the manifest and shows the secret once', async ({ page }) => {
  await open(page);
  let sent: any = null;
  await page.route('**/operator/v1/products/zyntrus', async (route) => {
    sent = route.request().postDataJSON();
    await fulfillJson(route, { success: true, data: { ...PORTAL, product_key: 'zyntrus', name: 'Zyntrus', client_id: 'karbexa-zyntrus', client_secret: 's3cret-shown-once' } }, 201);
  });
  await page.getByRole('button', { name: 'Register standalone portal' }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Zyntrus');
  await page.getByRole('textbox', { name: 'Key', exact: true }).fill('zyntrus');
  await page.getByRole('textbox', { name: 'Launch URL', exact: true }).fill('https://zyntrus.example.com/');
  await page.getByRole('textbox', { name: 'Redirect URIs', exact: true }).fill('https://zyntrus.example.com/auth/callback');
  await page.getByLabel('Back-channel logout URI').fill('https://zyntrus.example.com/auth/backchannel-logout');
  await page.getByLabel('Role 1 key').fill('recruiter');
  await page.getByLabel('Role 1 name').fill('Recruiter');
  await page.getByTestId('standalone-save').click();

  await expect(page.getByTestId('secret-once')).toContainText('karbexa-zyntrus');
  await expect(page.getByTestId('secret-once')).toContainText('s3cret-shown-once');
  expect(sent.key).toBe('zyntrus');
  expect(sent.hosting.mode).toBe('standalone');
  expect(sent.hosting.client).toMatchObject({ type: 'confidential', redirect_uris: ['https://zyntrus.example.com/auth/callback'], backchannel_logout_uri: 'https://zyntrus.example.com/auth/backchannel-logout' });
  expect(sent.roles).toEqual([{ key: 'recruiter', name: 'Recruiter', rank: 10, is_default: true }]);
  expect(sent.version).toBe(1);

  await page.getByTestId('secret-stored').click();
  await expect(page.getByTestId('secret-once')).toHaveCount(0);
});

test('Rotate secret asks for confirmation, then shows the new secret once and the 24 hour overlap', async ({ page }) => {
  await open(page);
  await page.route('**/operator/v1/products/assets/rotate-secret', (route) =>
    fulfillJson(route, { success: true, data: { client_id: 'karbexa-assets', client_secret: 'rotated-secret', previous_secret_expires_at: '2026-11-19T10:00:00Z' } })
  );
  await page.getByRole('button', { name: 'Rotate secret of Assets' }).click();
  await page.getByRole('button', { name: 'Rotate secret', exact: true }).click();
  await expect(page.getByTestId('secret-once')).toContainText('rotated-secret');
  await expect(page.getByTestId('secret-once')).toContainText('previous secret keeps working');
});

test('on a phone the client ID and the new secret stay readable next to their copy buttons', async ({ page }) => {
  // Regression: a global phone rule forced every button to width 100%, so the copy button took the whole row
  // and the secret was squeezed to zero width (the text was in the DOM, so toContainText alone never noticed).
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.route('**/operator/v1/products/assets/rotate-secret', (route) =>
    fulfillJson(route, { success: true, data: { client_id: 'karbexa-assets', client_secret: 'rotated-secret', previous_secret_expires_at: '2026-11-19T10:00:00Z' } })
  );
  await page.getByRole('button', { name: 'Rotate secret of Assets' }).click();
  await page.getByRole('button', { name: 'Rotate secret', exact: true }).click();
  for (const value of ['karbexa-assets', 'rotated-secret']) {
    const text = page.getByTestId('secret-once').getByTitle(value);
    await expect(text).toBeVisible();
    expect((await text.boundingBox())!.width).toBeGreaterThan(100);
  }
  const copy = await page.getByRole('button', { name: 'Copy Client secret' }).boundingBox();
  expect(copy!.width).toBeLessThan(48);
});

test('server refusals (ROLE_IN_USE) surface as an error and keep the form open', async ({ page }) => {
  await open(page);
  await page.route('**/operator/v1/products/assets', (route) => fulfillJson(route, { success: false, error: 'Role in use', code: 'ROLE_IN_USE' }, 409));
  await page.getByRole('button', { name: 'Edit Assets' }).click();
  await page.getByTestId('standalone-save').click();
  await expect(page.getByText('Role in use')).toBeVisible();
  await expect(page.getByTestId('standalone-form')).toBeVisible();
});
