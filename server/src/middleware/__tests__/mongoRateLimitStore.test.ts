// Plan 0.5: the shared rate-limit store. Two store instances (two Admin processes) share one counter.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Options } from 'express-rate-limit';
import { MongoRateLimitStore } from '../mongoRateLimitStore';
import { RateLimitWindow } from '../../models/RateLimitWindow.model';

const opts = (windowMs: number) => ({ windowMs } as Options);
let mongo: MongoMemoryServer;

after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('without a database connection the store falls back to memory', async () => {
  assert.notEqual(mongoose.connection.readyState, 1);
  const s = new MongoRateLimitStore('fallback');
  s.init(opts(60_000));
  assert.equal((await s.increment('ip-1')).totalHits, 1);
  assert.equal((await s.increment('ip-1')).totalHits, 2);
  s.shutdown();
});

test('two store instances share one count; prefixes keep limiters apart', async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'ratelimit_test' });
  await RateLimitWindow.init();

  const a = new MongoRateLimitStore('auth');
  const b = new MongoRateLimitStore('auth');
  const other = new MongoRateLimitStore('global');
  for (const s of [a, b, other]) s.init(opts(60_000));

  assert.equal((await a.increment('1.2.3.4')).totalHits, 1);
  assert.equal((await b.increment('1.2.3.4')).totalHits, 2);
  assert.equal((await a.increment('1.2.3.4')).totalHits, 3);
  assert.equal((await other.increment('1.2.3.4')).totalHits, 1, 'a different limiter prefix counts separately');
  assert.equal((await b.get('1.2.3.4'))?.totalHits, 3);

  await b.decrement('1.2.3.4');
  assert.equal((await a.get('1.2.3.4'))?.totalHits, 2);
  await a.resetKey('1.2.3.4');
  assert.equal(await b.get('1.2.3.4'), undefined);

  const parallel = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment('burst')));
  assert.deepEqual(parallel.map((r) => r.totalHits).sort((x, y) => x - y), Array.from({ length: 20 }, (_, i) => i + 1));
});

test('an expired window starts again at 1 even before the TTL monitor deletes the row', async () => {
  const s = new MongoRateLimitStore('short');
  s.init(opts(150));
  assert.equal((await s.increment('k')).totalHits, 1);
  assert.equal((await s.increment('k')).totalHits, 2);
  await new Promise((r) => setTimeout(r, 250));
  assert.equal((await s.increment('k')).totalHits, 1);
});
