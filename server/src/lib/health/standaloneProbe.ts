// server/src/lib/health/standaloneProbe.ts — reachability of standalone portals (DRD §8.7, PRD SP-8).
// GET `health_url` (or `launch_url` when there is none) through the SSRF guard: the host is resolved once, every address is
// validated, and the connection goes to that address only. 5 s timeout; redirects are not followed (a 3xx counts as alive).
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import { resolveSafeSubscriber } from '../ssrfGuard';

export const PORTAL_PROBE_TIMEOUT_MS = 5_000;

export interface PortalProbe { ok: boolean; status: number | null; ms: number; error?: string }

/** 2xx and 3xx mean the portal answered (DRD §8.7: "non-2xx/3xx ... on 3 consecutive checks -> degraded"). */
export const isAlive = (status: number | null): boolean => status !== null && status >= 200 && status < 400;

function getPinned(url: URL, address: string | undefined, family: 4 | 6 | undefined, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const options: https.RequestOptions = {
      method: 'GET', hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port || undefined, path: `${url.pathname}${url.search}`,
      headers: { 'User-Agent': 'karbexa-health/1', Accept: '*/*' }, signal: AbortSignal.timeout(timeoutMs),
    };
    if (address) {
      const fam = family ?? (net.isIP(address) === 6 ? 6 : 4);
      options.lookup = ((_h, opts, cb) => {
        if ((opts as dns.LookupOptions).all) (cb as (e: null, a: dns.LookupAddress[]) => void)(null, [{ address, family: fam }]);
        else (cb as (e: null, a: string, f: number) => void)(null, address, fam);
      }) as net.LookupFunction;
    }
    const req = mod.request(options, (res) => { res.destroy(); resolve(res.statusCode ?? 0); });
    req.on('error', reject);
    req.end();
  });
}

/** One probe. Never throws: a refused URL, a timeout or a connection error is a failed probe. */
export async function probePortal(url: string, timeoutMs = PORTAL_PROBE_TIMEOUT_MS, now: () => number = Date.now): Promise<PortalProbe> {
  const started = now();
  try {
    const target = await resolveSafeSubscriber(url);
    const status = await getPinned(target.url, target.address, target.family, timeoutMs);
    return { ok: isAlive(status), status, ms: now() - started, ...(isAlive(status) ? {} : { error: `HTTP ${status}` }) };
  } catch (err) {
    const name = (err as Error)?.name;
    const error = name === 'TimeoutError' || name === 'AbortError' ? `timed out after ${timeoutMs / 1000} s` : String((err as Error)?.message ?? err).slice(0, 120);
    return { ok: false, status: null, ms: now() - started, error };
  }
}
