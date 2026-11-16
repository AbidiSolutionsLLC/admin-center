// Plan 4.12: which announcement is current. In-memory MongoDB.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { currentAnnouncement } from '../announcement';
import { Announcement } from '../../models/Announcement.model';

let mongo: MongoMemoryServer;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri(), { dbName: 'announcement' }); });
after(async () => { await mongoose.disconnect(); await mongo.stop(); });
beforeEach(async () => { await Announcement.deleteMany({}); });

const now = new Date('2026-11-16T12:00:00Z');
const h = (n: number) => new Date(now.getTime() + n * 3600_000);
const mk = (message: string, from: number, to: number) => Announcement.create({ message, severity: 'info', starts_at: h(from), ends_at: h(to), created_by: new Types.ObjectId() });

test('none, scheduled, active, ended', async () => {
  assert.equal(await currentAnnouncement(now), null);
  await mk('later', 1, 2);
  assert.equal(await currentAnnouncement(now), null, 'not started');
  await mk('now', -1, 1);
  assert.equal((await currentAnnouncement(now))?.message, 'now');
  assert.equal(await currentAnnouncement(h(5)), null, 'ended');
});

test('the latest started wins when windows overlap', async () => {
  await mk('old', -3, 5);
  await mk('new', -1, 5);
  assert.equal((await currentAnnouncement(now))?.message, 'new');
});

test('the end instant is exclusive', async () => {
  await mk('x', -1, 0);
  assert.equal(await currentAnnouncement(now), null);
});
