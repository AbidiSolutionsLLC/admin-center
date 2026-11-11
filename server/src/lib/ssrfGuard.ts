// server/src/lib/ssrfGuard.ts — SSRF validation + connect-time IP pinning for subscriber URLs (06 §4.4)
import dns from 'dns';
import http from 'http';
import https from 'https';
import net from 'net';
import ipaddr from 'ipaddr.js';

/** Blocked even where ipaddr.js would not call the range non-unicast (belt and braces; E4 review L1). */
const BLOCKED_CIDRS = [
  '::/96',               // IPv4-compatible
  '64:ff9b::/96',        // NAT64
  '2002::/16',           // 6to4
  '2001::/32',           // Teredo
  '100::/64',            // discard-only
  '2001:db8::/32',       // documentation
  '198.18.0.0/15',       // benchmarking
  '192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24', // TEST-NET-1/2/3
  '168.63.129.16/32',    // Azure WireServer
  '169.254.169.254/32',  // cloud metadata (also link-local)
].map((c) => ipaddr.parseCIDR(c));

/** True for anything that is not a public unicast address. Unparseable input is treated as private (deny). */
export function isPrivateAddress(raw: string): boolean {
  const text = raw.trim().toLowerCase().split('%')[0];
  // ipaddr.js reads "::1.2.3.4" (IPv4-compatible) as IPv4-mapped, which would turn it into the public-looking 1.2.3.4 while the
  // socket would still connect to the IPv6 literal. A dotted-quad IPv6 suffix is only legitimate in the ::ffff: form.
  if (text.includes(':') && text.includes('.') && !/^::ffff:\d{1,3}(\.\d{1,3}){3}$/.test(text)) return true;
  if (!ipaddr.isValid(text)) return true;
  let addr = ipaddr.parse(text);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) addr = (addr as ipaddr.IPv6).toIPv4Address();
  for (const cidr of BLOCKED_CIDRS) {
    if (cidr[0].kind() === addr.kind() && addr.match(cidr)) return true;
  }
  return addr.range() !== 'unicast';
}

/** A validated subscriber URL plus the one address the connection must use (absent only for the dev loopback exemption). */
export interface PinnedTarget { url: URL; address?: string; family?: 4 | 6 }

/**
 * Throws if the URL is not a safe subscriber target. Resolves the host ONCE, validates EVERY resolved address and returns
 * the first one so the caller can connect to exactly that address (no second DNS lookup = no rebinding window).
 */
export async function resolveSafeSubscriber(url: string): Promise<PinnedTarget> {
  const prod = process.env.NODE_ENV === 'production';
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('Invalid subscriber URL'); }
  if (u.username || u.password) throw new Error('Credentials in subscriber URL are not allowed');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (u.protocol === 'http:') {
    if (prod || !isLocalhost) throw new Error('Subscriber URL must use https');
  } else if (u.protocol !== 'https:') {
    throw new Error('Subscriber URL must use https');
  }
  if (!prod && isLocalhost) return { url: u };
  const literal = net.isIP(host);
  const addrs = literal
    ? [{ address: host, family: literal }]
    : await dns.promises.lookup(host, { all: true, verbatim: true });
  if (addrs.length === 0) throw new Error('Subscriber host did not resolve');
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) throw new Error('Subscriber URL resolves to a disallowed address');
  }
  return { url: u, address: addrs[0].address, family: addrs[0].family === 6 ? 6 : 4 };
}

export async function assertSafeSubscriberUrl(url: string): Promise<URL> {
  return (await resolveSafeSubscriber(url)).url;
}

/**
 * POST with node:http(s) connecting only to target.address while keeping Host and TLS SNI/certificate checks on the
 * original hostname. Redirects are never followed and the response body is never read. Resolves with the status code.
 */
export function postPinned(target: PinnedTarget, init: { headers: Record<string, string>; body: string; timeoutMs: number }): Promise<number> {
  return new Promise((resolve, reject) => {
    const u = target.url;
    const mod = u.protocol === 'https:' ? https : http;
    const { address, family } = target;
    const options: https.RequestOptions = {
      method: 'POST',
      hostname: u.hostname.replace(/^\[|\]$/g, ''),
      port: u.port || undefined,
      path: `${u.pathname}${u.search}`,
      headers: { ...init.headers, 'Content-Length': String(Buffer.byteLength(init.body)) },
      signal: AbortSignal.timeout(init.timeoutMs),
    };
    if (address) {
      options.lookup = ((_host, opts, cb) => {
        if ((opts as dns.LookupOptions).all) (cb as (e: null, a: dns.LookupAddress[]) => void)(null, [{ address, family: family ?? 4 }]);
        else (cb as (e: null, a: string, f: number) => void)(null, address, family ?? 4);
      }) as net.LookupFunction;
    }
    const req = mod.request(options, (res) => {
      res.destroy(); // body is never read; release the socket
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(init.body);
  });
}
