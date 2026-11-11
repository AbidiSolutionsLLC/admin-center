// server/src/lib/trustProxy.ts — M2: explicit, validated `trust proxy` setting (an unset value in production must not silently trust 1 hop)
import { isValidIpOrCidr } from '../utils/ipUtils';

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * TRUST_PROXY: a hop count ("1"), a comma-separated list of proxy IPs/CIDRs (or loopback/linklocal/uniquelocal), or "false"/"0".
 * Production: must be set explicitly, and "true" (trust every hop, so X-Forwarded-For is fully spoofable) is rejected.
 * Development: unset defaults to 1 hop; "true" is allowed.
 */
export function resolveTrustProxy(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const isProd = env.NODE_ENV === 'production';
  const raw = env.TRUST_PROXY?.trim();
  if (!raw) {
    if (isProd) throw new Error('TRUST_PROXY must be set explicitly in production (a hop count, a proxy CIDR list, or "false").');
    return 1;
  }
  const lower = raw.toLowerCase();
  if (lower === 'false') return false;
  if (lower === 'true') {
    if (isProd) throw new Error('TRUST_PROXY=true trusts every X-Forwarded-For hop and is not allowed in production; use a hop count or the proxy CIDRs.');
    return true;
  }
  if (/^\d+$/.test(raw)) return Number(raw);
  const entries = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (entries.length === 0 || !entries.every((e) => KEYWORDS.has(e.toLowerCase()) || isValidIpOrCidr(e))) {
    throw new Error('TRUST_PROXY must be a hop count, "false", or a comma-separated list of IPs/CIDRs.');
  }
  return entries.join(',');
}
