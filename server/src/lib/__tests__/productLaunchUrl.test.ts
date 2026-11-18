// server/src/lib/__tests__/productLaunchUrl.test.ts
// Product launcher tiles must open the products web app on its registered OIDC origin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_DEFS, productLaunchUrl } from '../productCatalog';

test('default launch URLs are the products app origin plus each product entry page', () => {
  const saved = process.env.PRODUCTS_SPA_ORIGIN;
  delete process.env.PRODUCTS_SPA_ORIGIN;
  try {
    const urls = Object.fromEntries(PRODUCT_DEFS.map((d) => [d.product_key, productLaunchUrl(d)]));
    assert.deepEqual(urls, {
      people: 'http://app.karbexa.localhost:5174/people/home',
      projects: 'http://app.karbexa.localhost:5174/project/projectDashboard',
      sign: 'http://app.karbexa.localhost:5174/sign/dashboard',
      desk: 'http://app.karbexa.localhost:5174/desk/home',
      kb: 'http://app.karbexa.localhost:5174/kb',
    });
  } finally {
    if (saved !== undefined) process.env.PRODUCTS_SPA_ORIGIN = saved;
  }
});

test('launch URLs follow PRODUCTS_SPA_ORIGIN (trailing slash ignored)', () => {
  const saved = process.env.PRODUCTS_SPA_ORIGIN;
  process.env.PRODUCTS_SPA_ORIGIN = 'https://app.karbexa.com/';
  try {
    assert.equal(productLaunchUrl({ path: '/desk/home' }), 'https://app.karbexa.com/desk/home');
  } finally {
    if (saved === undefined) delete process.env.PRODUCTS_SPA_ORIGIN; else process.env.PRODUCTS_SPA_ORIGIN = saved;
  }
});
