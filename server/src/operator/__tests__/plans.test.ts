// Plan 4.5: what applying a plan does (DRD 3.2 rules 2 to 4). Pure functions, no database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffPlan, dryRunSummary } from '../plans';

const ent = (product_key: string, status: string, source: string, seats_limit?: number | null) => ({ product_key, status, source, ...(seats_limit === undefined ? {} : { seats_limit }) });

test('a new plan product is added; an active one is unchanged', () => {
  const d = diffPlan(['people', 'desk'], [ent('people', 'active', 'plan')]);
  assert.deepEqual(d, { added: ['desk'], restricted: [], unchanged: ['people'], reseated: [] });
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
  assert.deepEqual(d, { added: [], restricted: [], unchanged: ['people'], reseated: [] });
});

test('a changed seat default is reported as reseated, not unchanged (regression: Apply said "up to date")', () => {
  const def = (k: string) => ({ zyntrus: 7, people: null } as Record<string, number | null>)[k] ?? null;
  const d = diffPlan(['zyntrus', 'people'], [ent('zyntrus', 'active', 'plan', 3), ent('people', 'active', 'plan')], def);
  assert.deepEqual(d.reseated, ['zyntrus']);
  assert.deepEqual(d.unchanged, ['people']);
});

test('a limit removed from the plan default (null) is reseated; an equal limit is not', () => {
  const none = () => null;
  assert.deepEqual(diffPlan(['people'], [ent('people', 'active', 'plan', 5)], none).reseated, ['people']);
  assert.deepEqual(diffPlan(['people'], [ent('people', 'active', 'plan', 5)], () => 5).reseated, []);
});

test('overrides and restricted entitlements are never reseated', () => {
  const def = () => 9;
  assert.deepEqual(diffPlan(['people'], [ent('people', 'active', 'operator', 2)], def).reseated, []);
  assert.deepEqual(diffPlan(['people'], [ent('people', 'restricted', 'plan', 2)], def).reseated, []);
});

test('a suspended plan-sourced product in the plan stays suspended (unchanged)', () => {
  assert.deepEqual(diffPlan(['people'], [ent('people', 'suspended', 'plan')]).unchanged, ['people']);
});

test('seed-sourced entitlements are not restricted', () => {
  assert.deepEqual(diffPlan([], [ent('people', 'active', 'seed')]).restricted, []);
});

test('dryRunSummary counts tenants per product and the tenants that would change', () => {
  const s = dryRunSummary([
    { added: ['desk'], restricted: [], unchanged: ['people'], reseated: [] },
    { added: ['desk'], restricted: ['sign'], unchanged: ['people'], reseated: [] },
    { added: [], restricted: [], unchanged: ['people', 'desk'], reseated: [] },
    { added: [], restricted: [], unchanged: ['people'], reseated: ['desk'] },
  ]);
  assert.deepEqual(s.added, [{ product_key: 'desk', tenants: 2 }]);
  assert.deepEqual(s.restricted, [{ product_key: 'sign', tenants: 1 }]);
  assert.deepEqual(s.unchanged, [{ product_key: 'desk', tenants: 1 }, { product_key: 'people', tenants: 4 }]);
  assert.deepEqual(s.reseated, [{ product_key: 'desk', tenants: 1 }]);
  assert.equal(s.tenants_affected, 3);
});
