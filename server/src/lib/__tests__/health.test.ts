// Plan 4.9: health rules (DRD 7.1 thresholds), route counters, products probe, check runner. Pure functions plus an in-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  evalAdminApi, evalDatabase, evalDispatcher, evalEmail, evalIdentity, evalJobs, evalProductsApi, evalProductsWorker, overallState,
} from '../health/evaluate';
import { bucketIndex, percentileFromBuckets, routeGroup, record, flushRouteMetrics, recentRouteStats, resetRouteMetrics, BUCKETS_MS } from '../health/routeMetrics';
import { recordCheck, runCheck } from '../health';
import { HealthCheck, HealthEvent, RouteMetric } from '../../models/Health.model';

let mongo: MongoMemoryServer;
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'health' });
  await Promise.all([HealthCheck.init(), HealthEvent.init(), RouteMetric.init()]);
});
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { resetRouteMetrics(); await Promise.all([HealthCheck.deleteMany({}), HealthEvent.deleteMany({}), RouteMetric.deleteMany({})]); });

const now = new Date('2026-11-16T12:00:00Z');
const MIN = 60_000;

test('admin_api: 5xx rate and p95 thresholds', () => {
  assert.equal(evalAdminApi({ count: 0, errors5xx: 0, p95Ms: null }).state, 'healthy');
  assert.equal(evalAdminApi({ count: 1000, errors5xx: 5, p95Ms: 200 }).state, 'healthy');
  assert.equal(evalAdminApi({ count: 1000, errors5xx: 20, p95Ms: 200 }).state, 'degraded');
  assert.equal(evalAdminApi({ count: 1000, errors5xx: 60, p95Ms: 200 }).state, 'critical');
  assert.equal(evalAdminApi({ count: 1000, errors5xx: 0, p95Ms: 2500 }).state, 'degraded');
});

test('database: ping, primary', () => {
  assert.equal(evalDatabase({ pingMs: 20, writable: true }).state, 'healthy');
  assert.equal(evalDatabase({ pingMs: 250, writable: true }).state, 'degraded');
  assert.equal(evalDatabase({ pingMs: null, writable: false }).state, 'critical');
  assert.equal(evalDatabase({ pingMs: 20, writable: false }).state, 'critical');
});

test('identity: keys per realm and the optional rotation deadline', () => {
  assert.equal(evalIdentity({ realmsWithKeys: 3, realms: 3, rotateBy: null }, now).state, 'healthy');
  assert.equal(evalIdentity({ realmsWithKeys: 2, realms: 3, rotateBy: null }, now).state, 'degraded');
  assert.equal(evalIdentity({ realmsWithKeys: 0, realms: 3, rotateBy: null }, now).state, 'critical');
  assert.equal(evalIdentity({ realmsWithKeys: 3, realms: 3, rotateBy: new Date(now.getTime() + 3 * 24 * 60 * MIN) }, now).state, 'degraded');
  assert.equal(evalIdentity({ realmsWithKeys: 3, realms: 3, rotateBy: new Date(now.getTime() + 30 * 24 * 60 * MIN) }, now).state, 'healthy');
});

test('event_dispatcher: lease age and backlog', () => {
  assert.equal(evalDispatcher({ leaseAgeMs: 2000, intervalMs: 2000, backlogOrgs: 0 }).state, 'healthy');
  assert.equal(evalDispatcher({ leaseAgeMs: 12_000, intervalMs: 2000, backlogOrgs: 0 }).state, 'degraded');
  assert.equal(evalDispatcher({ leaseAgeMs: 6 * MIN, intervalMs: 2000, backlogOrgs: 0 }).state, 'critical');
  assert.equal(evalDispatcher({ leaseAgeMs: 1000, intervalMs: 2000, backlogOrgs: 51 }).state, 'degraded');
  assert.equal(evalDispatcher({ leaseAgeMs: null, intervalMs: 2000, backlogOrgs: 0 }).state, 'degraded');
});

test('products_api and products_worker', () => {
  assert.equal(evalProductsApi(null).state, 'unknown');
  assert.equal(evalProductsApi({ answered: false, ms: 5000, status: null, error: 'timed out after 5 s' }).state, 'critical');
  assert.equal(evalProductsApi({ answered: true, ms: 2500, status: 200 }).state, 'degraded');
  assert.equal(evalProductsApi({ answered: true, ms: 100, status: 404 }).state, 'degraded');
  assert.equal(evalProductsApi({ answered: true, ms: 100, status: 200 }).state, 'healthy');
  assert.equal(evalProductsWorker(null).state, 'unknown');
  assert.equal(evalProductsWorker({ leaseAgeMs: 5000, maxLag: 0, parkedTotal: 0 }).state, 'healthy');
  assert.equal(evalProductsWorker({ leaseAgeMs: 5000, maxLag: 101, parkedTotal: 0 }).state, 'degraded');
  assert.equal(evalProductsWorker({ leaseAgeMs: 5000, maxLag: 0, parkedTotal: 1 }).state, 'degraded');
  assert.equal(evalProductsWorker({ leaseAgeMs: 6 * MIN, maxLag: 0, parkedTotal: 0 }).state, 'critical');
  assert.equal(evalProductsWorker({ leaseAgeMs: null, maxLag: 0, parkedTotal: 0 }).state, 'critical');
});

test('email and jobs', () => {
  assert.equal(evalEmail({ sent: 0, failed: 0, oldestQueuedAgeMs: null }).state, 'healthy');
  assert.equal(evalEmail({ sent: 90, failed: 10, oldestQueuedAgeMs: null }).state, 'degraded');
  assert.equal(evalEmail({ sent: 70, failed: 30, oldestQueuedAgeMs: null }).state, 'critical');
  assert.equal(evalEmail({ sent: 10, failed: 0, oldestQueuedAgeMs: 11 * MIN }).state, 'degraded');
  assert.equal(evalEmail({ sent: 10, failed: 0, oldestQueuedAgeMs: 61 * MIN }).state, 'critical');
  assert.equal(evalJobs({ failedLastHour: 0, overdueAgeMs: null }).state, 'healthy');
  assert.equal(evalJobs({ failedLastHour: 1, overdueAgeMs: null }).state, 'degraded');
  assert.equal(evalJobs({ failedLastHour: 0, overdueAgeMs: 16 * MIN }).state, 'critical');
});

test('overall state: worst wins, unknown counts as degraded', () => {
  assert.equal(overallState(['healthy', 'healthy']), 'healthy');
  assert.equal(overallState(['healthy', 'unknown']), 'degraded');
  assert.equal(overallState(['degraded', 'critical', 'healthy']), 'critical');
  assert.equal(overallState([]), 'unknown');
});

test('route counters: buckets, percentile, groups', () => {
  assert.equal(bucketIndex(10), 0);
  assert.equal(bucketIndex(50), 0);
  assert.equal(bucketIndex(51), 1);
  assert.equal(bucketIndex(99999), BUCKETS_MS.length);
  assert.equal(percentileFromBuckets([0, 0, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(percentileFromBuckets([95, 0, 0, 0, 5, 0, 0, 0]), 50);
  assert.equal(percentileFromBuckets([50, 0, 0, 0, 50, 0, 0, 0]), 1000);
  assert.equal(percentileFromBuckets([0, 0, 0, 0, 0, 0, 0, 10]), 10_000);
  assert.equal(routeGroup('/api/v1/people/123?x=1'), 'people');
  assert.equal(routeGroup('/operator/v1/orgs'), 'operator');
  assert.equal(routeGroup('/realms/tenant/oauth/token'), 'realms/tenant');
  assert.equal(routeGroup('/platform/v1/orgs'), 'platform');
  assert.equal(routeGroup('/favicon.ico'), 'other');
});

test('route counters: flushed per minute, aggregated over the window, never a path', async () => {
  const t = Date.now();
  for (let i = 0; i < 95; i++) record('/api/v1/people', 200, 20, t);
  for (let i = 0; i < 5; i++) record('/api/v1/people/1?secret=abc', 500, 1500, t);
  await flushRouteMetrics();
  await flushRouteMetrics(); // nothing pending: no change
  const docs = await RouteMetric.find().lean();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].count, 100);
  assert.equal(docs[0].errors_5xx, 5);
  assert.deepEqual(docs[0].groups, [{ group: 'people', count: 100, errors_5xx: 5 }]);
  assert.ok(!JSON.stringify(docs[0]).includes('secret'));
  const stats = await recentRouteStats(5 * MIN, t + MIN);
  assert.deepEqual({ count: stats.count, errors5xx: stats.errors5xx, p95Ms: stats.p95Ms }, { count: 100, errors5xx: 5, p95Ms: 50 });
  record('/api/v1/people', 200, 10, t); // same minute, flushed again: adds to the same document
  await flushRouteMetrics();
  assert.equal((await RouteMetric.findOne().lean())!.count, 101);
  assert.equal((await recentRouteStats(5 * MIN, t + 10 * MIN)).count, 0, 'outside the window');
});

test('recordCheck: the first result adds no event; a change adds one with from and to', async () => {
  await recordCheck('jobs', { state: 'healthy', detail: 'ok' }, now);
  assert.equal(await HealthEvent.countDocuments(), 0);
  await recordCheck('jobs', { state: 'healthy', detail: 'ok' }, new Date(now.getTime() + MIN));
  assert.equal(await HealthEvent.countDocuments(), 0);
  await recordCheck('jobs', { state: 'degraded', detail: '1 failed' }, new Date(now.getTime() + 2 * MIN));
  const ev = await HealthEvent.findOne().lean();
  assert.deepEqual({ c: ev!.component, f: ev!.from, t: ev!.to, d: ev!.detail }, { c: 'jobs', f: 'healthy', t: 'degraded', d: '1 failed' });
  assert.equal((await HealthCheck.findOne({ component: 'jobs' }).lean())!.state, 'degraded');
});

test('runCheck: a real check returns an evaluation; a slow one is cut off as unknown', async () => {
  const jobs = await runCheck('jobs', now);
  assert.equal(jobs.state, 'healthy');
  const db = await runCheck('database', now);
  assert.ok(['healthy', 'degraded'].includes(db.state), db.detail);
  const slow = await runCheck('admin_api', now, 0); // a zero limit loses the race
  assert.equal(slow.state, 'unknown');
});
