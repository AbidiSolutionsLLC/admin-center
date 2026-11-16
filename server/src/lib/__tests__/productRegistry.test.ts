// Plan 1.1: product keys are data. In-memory MongoDB.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { App } from '../../models/App.model';
import { listProducts, getProduct, assertProductKey, assertProductKeys, invalidateProductRegistry } from '../productRegistry';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'product_registry' });
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });

const mk = (product_key: string, extra: Record<string, unknown> = {}) => App.create({
  name: product_key, slug: `karbexa-${product_key}`, category: 'Karbexa', is_system_app: true, app_type: 'karbexa_product', product_key, ...extra,
});

test('registry reads karbexa_product apps; admin and third-party apps are not products', async () => {
  await mk('people'); await mk('demo'); await mk('admin');
  await App.create({ name: 'x', slug: 'third', category: 'c', app_type: 'third_party', product_key: 'ghost' });
  invalidateProductRegistry();
  assert.deepEqual((await listProducts()).map(p => p.product_key), ['demo', 'people']);
  assert.equal((await getProduct('demo'))?.name, 'demo');
  assert.equal(await getProduct('admin'), undefined);
});

test('assertProductKey throws UNKNOWN_PRODUCT (400) for unknown and reserved keys', async () => {
  assert.equal(await assertProductKey('people'), 'people');
  for (const k of ['nope', 'admin', 'ghost']) {
    await assert.rejects(() => assertProductKey(k), (e: any) => e.statusCode === 400 && e.code === 'UNKNOWN_PRODUCT');
  }
  await assert.rejects(() => assertProductKeys(['people', 'nope']), (e: any) => e.code === 'UNKNOWN_PRODUCT');
});

test('cache holds for 60 seconds until invalidated', async () => {
  invalidateProductRegistry();
  await listProducts();
  await mk('late');
  assert.equal(await getProduct('late'), undefined);
  invalidateProductRegistry();
  assert.ok(await getProduct('late'));
});
