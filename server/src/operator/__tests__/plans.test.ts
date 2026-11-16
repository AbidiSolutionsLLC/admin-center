// Plan 4.5: what applying a plan does (DRD 3.2 rules 2 to 4). Pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPlan, dryRunSummary } from '../plans';

const ent = (product_key: string, status: string, source: string) => ({ product_key, status, source });

test('a new plan product is added; an active one is unchanged', () => {
  const d = diffPlan(['people', 'desk'], [ent('people', 'active', 'plan')]);
  assert.deepEqual(d, { added: ['desk'], restricted: [], unchanged: ['people'] });
});

test('a plan-sourced product that left the plan is restricted; one already restricted is not repeated', () => {
  const d = diffPlan(['people'], [ent('people', 'active', 'plan'), ent('sign', 'active', 'plan'), ent('desk', 'restricted', 'plan')]);
  assert.deepEqual(d.restricted, ['sign']);
});

test('a restricted product that returns to the plan is added back', () => {
  assert.deepEqual(diffPlan(['sign'], [ent('sign', 'restricted', 'plan')]).added, ['sign']);
});

test('overrides are never touched, in either direction', () => {
  const d = diffPlan(['people'], [ent('people', 'suspended', 'operator'), ent('desk', 'active', 'operator')]);
  assert.deepEqual(d, { added: [], restricted: [], unchanged: ['people'] });
});

test('a suspended plan-sourced product in the plan stays suspended (unchanged)', () => {
  assert.deepEqual(diffPlan(['people'], [ent('people', 'suspended', 'plan')]).unchanged, ['people']);
});

test('seed-sourced entitlements are not restricted', () => {
  assert.deepEqual(diffPlan([], [ent('people', 'active', 'seed')]).restricted, []);
});

test('dryRunSummary counts tenants per product and the tenants that would change', () => {
  const s = dryRunSummary([
    { added: ['desk'], restricted: [], unchanged: ['people'] },
    { added: ['desk'], restricted: ['sign'], unchanged: ['people'] },
    { added: [], restricted: [], unchanged: ['people', 'desk'] },
  ]);
  assert.deepEqual(s.added, [{ product_key: 'desk', tenants: 2 }]);
  assert.deepEqual(s.restricted, [{ product_key: 'sign', tenants: 1 }]);
  assert.deepEqual(s.unchanged, [{ product_key: 'desk', tenants: 1 }, { product_key: 'people', tenants: 3 }]);
  assert.equal(s.tenants_affected, 2);
});
