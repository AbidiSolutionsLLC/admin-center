// server/src/middleware/mongoRateLimitStore.ts
// Shared `express-rate-limit` store backed by MongoDB (Plan 0.5), so several Admin instances count together.
// Implements the `Store` type of express-rate-limit 8.x (dist/index.d.ts). While Mongoose is not connected
// (unit tests that build a limiter without a database) it falls back to the library's MemoryStore.
import mongoose from 'mongoose';
import { MemoryStore } from 'express-rate-limit';
import type { Store, Options, ClientRateLimitInfo, IncrementResponse } from 'express-rate-limit';
import { RateLimitWindow } from '../models/RateLimitWindow.model';

const connected = (): boolean => mongoose.connection.readyState === 1;

export class MongoRateLimitStore implements Store {
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;
  private memory = new MemoryStore();

  /** `prefix` keeps each limiter's counters apart (the same IP is counted by several limiters). */
  constructor(prefix: string) {
    this.prefix = `${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
    this.memory.init(options);
  }

  private id(key: string): string {
    return this.prefix + key;
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (!connected()) return this.memory.increment(key);
    const now = new Date();
    const next = new Date(now.getTime() + this.windowMs);
    // One atomic upsert. An expired row (the TTL monitor lags up to a minute) starts a new window instead of counting on.
    const update = [{
      $set: {
        hits: { $cond: [{ $gt: ['$expires_at', now] }, { $add: ['$hits', 1] }, 1] },
        expires_at: { $cond: [{ $gt: ['$expires_at', now] }, '$expires_at', next] },
      },
    }];
    const run = () => RateLimitWindow.findOneAndUpdate({ _id: this.id(key) }, update, { upsert: true, returnDocument: 'after' }).lean();
    let doc;
    try {
      doc = await run();
    } catch (err: any) {
      if (err?.code !== 11000) throw err; // two first hits raced on the upsert: the second finds the row
      doc = await run();
    }
    return { totalHits: doc!.hits, resetTime: doc!.expires_at };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    if (!connected()) return this.memory.get(key);
    const doc = await RateLimitWindow.findOne({ _id: this.id(key), expires_at: { $gt: new Date() } }).lean();
    return doc ? { totalHits: doc.hits, resetTime: doc.expires_at } : undefined;
  }

  async decrement(key: string): Promise<void> {
    if (!connected()) return this.memory.decrement(key);
    await RateLimitWindow.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    if (!connected()) return this.memory.resetKey(key);
    await RateLimitWindow.deleteOne({ _id: this.id(key) });
  }

  async resetAll(): Promise<void> {
    if (!connected()) return this.memory.resetAll();
    await RateLimitWindow.deleteMany({ _id: { $regex: `^${this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } });
  }

  shutdown(): void {
    this.memory.shutdown();
  }
}
