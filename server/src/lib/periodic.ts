// server/src/lib/periodic.ts
// Scheduled jobs that must run on one Admin instance at a time (Plan 0.6). `every` = setInterval guarded by the
// Mongo lease in lib/platformLease.ts, so a second instance skips the tick while the first holds the lease.
import os from 'os';
import { acquireLease, releaseLease } from './platformLease';

const HOLDER = `${os.hostname()}:${process.pid}`;

/**
 * Run `fn` every `ms` while this instance holds the lease `name`. A run that is still going when the next tick
 * arrives is not started twice. Errors are logged, never thrown. Returns a stop function that releases the lease.
 */
export function every(name: string, ms: number, fn: () => Promise<void>): () => void {
  const ttl = Math.max(ms * 3, 15_000);
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    (async () => {
      if (!(await acquireLease(name, HOLDER, ttl))) return;
      await fn();
    })()
      .catch((err) => console.error(`[periodic:${name}]`, err))
      .finally(() => { running = false; });
  }, ms);
  timer.unref();
  return () => {
    clearInterval(timer);
    releaseLease(name, HOLDER).catch(() => undefined);
  };
}
