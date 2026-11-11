// L6 (E4 review): a standalone MongoDB is refused unless ALLOW_STANDALONE_MONGO=true outside production.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create(); // standalone
  await mongoose.connect(mongo.getUri(), { dbName: 'standalone_guard_test' });
});
after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

const withEnv = async (env: Record<string, string | undefined>, fn: () => Promise<void>) => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { prev[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { await fn(); } finally { for (const k of Object.keys(env)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};

test('standalone + no flag (development): runInTransaction throws and never runs the callback', async () => {
  const { runInTransaction } = await import('../platformEvents');
  let ran = false;
  await withEnv({ NODE_ENV: 'development', ALLOW_STANDALONE_MONGO: undefined }, async () => {
    await assert.rejects(() => runInTransaction(async () => { ran = true; }), /replica set/);
  });
  assert.equal(ran, false);
});

test('standalone + ALLOW_STANDALONE_MONGO=false behaves like unset', async () => {
  const { runInTransaction } = await import('../platformEvents');
  await withEnv({ NODE_ENV: 'development', ALLOW_STANDALONE_MONGO: 'false' }, async () => {
    await assert.rejects(() => runInTransaction(async () => 1), /replica set/);
  });
});

test('standalone + ALLOW_STANDALONE_MONGO=true (development): runs without a session', async () => {
  const { runInTransaction } = await import('../platformEvents');
  await withEnv({ NODE_ENV: 'development', ALLOW_STANDALONE_MONGO: 'true' }, async () => {
    assert.equal(await runInTransaction(async (session) => (session === undefined ? 'no-session' : 'session')), 'no-session');
  });
});

test('standalone in production is refused even with the flag', async () => {
  const { runInTransaction } = await import('../platformEvents');
  await withEnv({ NODE_ENV: 'production', ALLOW_STANDALONE_MONGO: 'true' }, async () => {
    await assert.rejects(() => runInTransaction(async () => 1), /not allowed in production/);
  });
});
