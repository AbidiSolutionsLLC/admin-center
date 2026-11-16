// server/src/lib/overrideJobs.ts
// Plan 4.6, DRD 3.2 rule 5: overrides with a passed `expires_at` fall back to plan state. The work is
// `expireOverrides` (operator/overrides.ts); this schedules it under a PlatformLease so one Admin instance runs it.
import { every } from './periodic';
import { expireOverrides } from '../operator/overrides';

/** Hourly rather than daily (DRD says daily): an instance that restarts every day would otherwise never reach its tick. */
export const OVERRIDE_EXPIRY_EVERY_MS = 60 * 60 * 1000;

let stop: (() => void) | undefined;

export function startOverrideJobs(): void {
  if (stop) return;
  stop = every('override-expiry', OVERRIDE_EXPIRY_EVERY_MS, async () => { await expireOverrides(); });
}

export function stopOverrideJobs(): void {
  stop?.();
  stop = undefined;
}
