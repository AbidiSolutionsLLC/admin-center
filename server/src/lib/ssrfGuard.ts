// server/src/lib/ssrfGuard.ts — SSRF validation for subscriber URLs (06 §4.4)
import dns from 'dns';
import net from 'net';

function isPrivateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)      // CGNAT
    || (a === 169 && b === 254)                // link-local + cloud metadata
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || ip.startsWith('192.0.0.')
    || (a === 198 && (b === 18 || b === 19))  // benchmarking 198.18.0.0/15
    || ip.startsWith('192.0.2.') || ip.startsWith('198.51.100.') || ip.startsWith('203.0.113.') // documentation
    || a >= 224;                               // multicast / reserved / broadcast
}

function isPrivateV6(raw: string): boolean {
  const ip = raw.toLowerCase().split('%')[0];
  if (ip === '::' || ip === '::1') return true;
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  if (ip.startsWith('::ffff:')) return true; // hex-form mapped: reject conservatively
  if (/^::(\d+\.\d+\.\d+\.\d+|[0-9a-f]{1,4}(:[0-9a-f]{1,4})?)$/.test(ip)) return true; // ::/96 IPv4-compatible
  if (/^64:ff9b::/.test(ip)) return true;                                  // 64:ff9b::/96 NAT64
  if (/^2002:/.test(ip)) return true;                                      // 2002::/16 6to4
  if (/^2001:(0{1,4})?:/.test(ip)) return true;                            // 2001::/32 Teredo
  if (/^100::/.test(ip) || /^100:0{1,4}:0{1,4}:0{1,4}:/.test(ip)) return true; // 100::/64 discard
  return /^f[cd]/.test(ip)        // fc00::/7 unique local
    || /^fe[89a-f]/.test(ip)      // fe80::/10 link-local + site-local
    || ip.startsWith('ff');       // multicast
}

export function isPrivateAddress(ip: string): boolean {
  return net.isIPv4(ip) ? isPrivateV4(ip) : isPrivateV6(ip);
}

/** Throws if the URL is not a safe subscriber target. Returns the parsed URL. */
export async function assertSafeSubscriberUrl(url: string): Promise<URL> {
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
  if (!prod && isLocalhost) return u;
  const addrs = net.isIP(host)
    ? [host]
    : (await dns.promises.lookup(host, { all: true })).map(a => a.address);
  if (addrs.length === 0) throw new Error('Subscriber host did not resolve');
  for (const a of addrs) {
    if (isPrivateAddress(a)) throw new Error('Subscriber URL resolves to a disallowed address');
  }
  return u;
}
