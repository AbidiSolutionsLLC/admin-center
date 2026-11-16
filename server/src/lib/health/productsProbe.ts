// server/src/lib/health/productsProbe.ts
// One call to the products backend's internal health route (`GET /api/v1/internal/health/platform-sync`) with the Admin
// service token (platform/productsInternalToken.ts). The result is cached for 30 seconds and shared by the health job
// (products_api and products_worker) and `GET /operator/v1/health/sync`, so the products backend is asked at most that often.
import { resolveProductsBaseUrl } from '../../platform/openItems';
import { getProductsInternalToken } from '../../platform/productsInternalToken';

export const PROBE_PATH = '/api/v1/internal/health/platform-sync';
export const PROBE_TTL_MS = 30_000;
const TIMEOUT_MS = 5_000;

export interface ProductsSyncRow {
  platformOrgId: string; lastAppliedSeq: number; pendingSeq: number; lag: number; parked: number; lastErrorCode: string | null; updatedAt: string | null;
}
export interface ProductsSummary {
  worker: { leaseAgeMs: number | null }; maxLag: number; parkedTotal: number; jobs: { failedLastHour: number }; build: { version: string; startedAt: string };
}
export interface ProbeResult {
  answered: boolean; ms: number; status: number | null; error?: string;
  orgs: ProductsSyncRow[]; summary: ProductsSummary | null; at: number;
}

export interface ProbeOptions { fetchImpl?: typeof fetch; now?: () => number; force?: boolean }

let cache: ProbeResult | undefined;
export function resetProductsProbe(): void { cache = undefined; }

/**
 * Ask the products backend. Returns null when this deployment cannot ask at all (no base URL, or no service key), which the
 * health check reports as `unknown` rather than as an outage. A network error, timeout or non-2xx is a result, not a throw.
 */
export async function probeProducts(opts: ProbeOptions = {}): Promise<ProbeResult | null> {
  const now = opts.now ?? Date.now;
  if (!opts.force && cache && now() - cache.at < PROBE_TTL_MS) return cache;
  const base = await resolveProductsBaseUrl();
  if (!base) return null;

  const started = now();
  const fail = (error: string, status: number | null = null): ProbeResult => ({ answered: false, ms: now() - started, status, error, orgs: [], summary: null, at: now() });
  let token: string;
  try {
    token = await getProductsInternalToken({ fetchImpl: opts.fetchImpl });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (/ADMIN_BACKEND_CLIENT_KEY is not set/.test(msg)) return null;
    return (cache = fail('service token request failed'));
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${base}${PROBE_PATH}`, { headers: { authorization: `Bearer ${token}` }, signal: ctl.signal });
    const ms = now() - started;
    const body = (await res.json().catch(() => null)) as { data?: { orgs?: ProductsSyncRow[]; summary?: ProductsSummary } } | null;
    cache = {
      answered: true, ms, status: res.status, at: now(),
      orgs: res.ok ? (body?.data?.orgs ?? []) : [], summary: res.ok ? (body?.data?.summary ?? null) : null,
    };
  } catch (err) {
    cache = fail((err as Error)?.name === 'AbortError' ? 'timed out after 5 s' : 'connection failed');
  } finally {
    clearTimeout(timer);
  }
  return cache;
}
