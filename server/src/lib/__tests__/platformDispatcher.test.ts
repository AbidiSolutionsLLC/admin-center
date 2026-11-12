// L9: dispatcher concurrency bound (no database). The lease itself is covered by smoke:sprint2 (needs Mongo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPool } from '../platformDispatcher';

test('runPool never has more than the limit in flight and processes every item exactly once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const seen: number[] = [];
  await runPool(Array.from({ length: 25 }, (_, i) => i), 4, async (i) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5 + (i % 3)));
    seen.push(i);
    inFlight--;
  });
  assert.equal(maxInFlight, 4);
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
});

test('runPool: a slow item does not block the others', async () => {
  const order: string[] = [];
  await runPool(['slow', 'a', 'b', 'c'], 2, async (name) => {
    await new Promise((r) => setTimeout(r, name === 'slow' ? 200 : 5));
    order.push(name);
  });
  assert.deepEqual(order, ['a', 'b', 'c', 'slow']);
});

test('runPool handles an empty list and a limit larger than the list', async () => {
  await runPool([], 4, async () => { assert.fail('must not run'); });
  const out: number[] = [];
  await runPool([1, 2], 10, async (n) => { out.push(n); });
  assert.deepEqual(out.sort(), [1, 2]);
});
