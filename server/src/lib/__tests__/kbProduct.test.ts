// server/src/lib/__tests__/kbProduct.test.ts
// Execution plan D-3 (decision G4): Knowledge Base is a built-in suite product. Its catalog equals the products
// manifest (karbexa-products backend/products/manifests/kb.js); it has no automatic default rule and is in no default
// plan; the products backend client may publish it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCT_DEFS, DEFAULT_PLANS } from '../productCatalog';
import { getClientAllowedProducts, PRODUCTS_BACKEND_CLIENT_ID } from '../../identity/config';

test('kb is seeded with the KB PRD roles plus read_only, kb_reader as default', () => {
  const kb = PRODUCT_DEFS.find((d) => d.product_key === 'kb');
  assert.ok(kb, 'kb in PRODUCT_DEFS');
  assert.deepEqual(kb.roles.map((r) => [r.key, r.rank]), [
    ['kb_administrator', 40], ['kb_reviewer', 30], ['kb_author', 20], ['kb_reader', 10], ['read_only', 5],
  ]);
  assert.deepEqual(kb.roles.filter((r) => r.is_default).map((r) => r.key), ['kb_reader']);
  assert.equal(kb.roles.find((r) => r.key === 'read_only')?.name, 'Read Only');
  assert.equal(kb.name, 'Knowledge Base');
  assert.equal(kb.path, '/kb');
  assert.equal(kb.product_category, 'work');
});

test('kb has no automatic default rule and is in no default plan', () => {
  const kb = PRODUCT_DEFS.find((d) => d.product_key === 'kb');
  assert.deepEqual(kb?.default_assignments, []);
  for (const plan of DEFAULT_PLANS) assert.ok(!plan.products.includes('kb'), plan.key);
});

test('the products backend client may publish kb by default; PLATFORM_CLIENT_PRODUCTS still overrides', () => {
  const saved = process.env.PLATFORM_CLIENT_PRODUCTS;
  try {
    delete process.env.PLATFORM_CLIENT_PRODUCTS;
    assert.ok(getClientAllowedProducts(PRODUCTS_BACKEND_CLIENT_ID).includes('kb'));
    assert.deepEqual(getClientAllowedProducts('some-other-client'), []);
    process.env.PLATFORM_CLIENT_PRODUCTS = JSON.stringify({ [PRODUCTS_BACKEND_CLIENT_ID]: ['people'] });
    assert.deepEqual(getClientAllowedProducts(PRODUCTS_BACKEND_CLIENT_ID), ['people']);
  } finally {
    if (saved === undefined) delete process.env.PLATFORM_CLIENT_PRODUCTS; else process.env.PLATFORM_CLIENT_PRODUCTS = saved;
  }
});
