import ipaddr from 'ipaddr.js';

export function isIpInRange(ip: string, range: string): boolean {
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
