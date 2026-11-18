import ipaddr from 'ipaddr.js';

/**
 * Azure App Service (and some other proxies) append the client port to X-Forwarded-For: `203.0.113.7:51234`, or
 * `[2001:db8::1]:443` for IPv6. `req.ip` then carries the port, which breaks allow-list comparison and splits one client
 * over many rate-limit keys. Returns the bare address; anything else (plain IPv4, plain IPv6, IPv4-mapped IPv6, empty) is unchanged.
 */
export function stripPort(ip: string): string {
  if (!ip) return ip;
  const bracketed = /^\[([0-9a-fA-F:.]+)\](?::\d{1,5})?$/.exec(ip);
  if (bracketed) return bracketed[1];
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(ip);
  return v4 ? v4[1] : ip;
}

export function isIpInRange(rawIp: string, range: string): boolean {
  const ip = stripPort(rawIp);
  if (!ip || !range) return false;

  try {
    if (ip === range) return true;
    if (ip === '::1' && range === '127.0.0.1') return true;
    if (ip === '::1' && range === '::1') return true;

    if (!ipaddr.isValid(ip)) return false;
    let parsedIp = ipaddr.parse(ip);

    if (range.includes('/')) {
      const parts = range.split('/');
      const rangeIpStr = parts[0];
      if (!ipaddr.isValid(rangeIpStr)) return false;
      const parsedRangeIp = ipaddr.parse(rangeIpStr);
      
      if (parsedIp.kind() === 'ipv6' && (parsedIp as ipaddr.IPv6).isIPv4MappedAddress() && parsedRangeIp.kind() === 'ipv4') {
        parsedIp = (parsedIp as ipaddr.IPv6).toIPv4Address();
      }

      if (parsedIp.kind() !== parsedRangeIp.kind()) return false;

      return parsedIp.match(ipaddr.parseCIDR(range));
    }

    if (!ipaddr.isValid(range)) return false;
    const parsedRangeIp = ipaddr.parse(range);
    
    if (parsedIp.kind() === 'ipv6' && (parsedIp as ipaddr.IPv6).isIPv4MappedAddress() && parsedRangeIp.kind() === 'ipv4') {
      parsedIp = (parsedIp as ipaddr.IPv6).toIPv4Address();
    }
    
    return parsedIp.toString() === parsedRangeIp.toString();
  } catch (e) {
    return false;
  }
}

export function isValidIpOrCidr(val: string): boolean {
  if (!val) return false;
  try {
    if (val.includes('/')) {
      ipaddr.parseCIDR(val);
      return true;
    } else {
      return ipaddr.isValid(val);
    }
  } catch {
    return false;
  }
}
