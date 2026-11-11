// server/src/lib/platformLease.ts — L9: Mongo lease so only one admin instance runs a singleton job (the nudge dispatcher)
import { PlatformLease } from '../models/PlatformLease.model';

/** Acquire or renew `name` for `holder`. True when this holder owns the lease until now+ttlMs. Never throws on contention. */
export async function acquireLease(name: string, holder: string, ttlMs: number, now: number = Date.now()): Promise<boolean> {
  try {
    const doc = await PlatformLease.findOneAndUpdate(
      { _id: name, $or: [{ until: { $lt: new Date(now) } }, { holder }] },
      { $set: { holder, until: new Date(now + ttlMs) } },
      { upsert: true, new: true },
    ).lean();
    return doc?.holder === holder;
  } catch (err) {
    // The filter did not match (another holder, not expired) and the upsert collided on _id.
    if ((err as { code?: number })?.code === 11000) return false;
    throw err;
  }
}

/** Release early (graceful shutdown). Only the current holder can release. */
export async function releaseLease(name: string, holder: string): Promise<void> {
  await PlatformLease.updateOne({ _id: name, holder }, { $set: { until: new Date(0) } });
}
