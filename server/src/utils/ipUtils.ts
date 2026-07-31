import * as net from 'net';

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isIpInRange(ip: string, range: string): boolean {
  if (ip === range) return true;
  // Handle ipv6 localhost translation to ipv4 if needed
  if (ip === '::1' && range === '127.0.0.1') return true;
  if (ip === '::1' && range === '::1') return true;
  
  if (!net.isIP(ip)) return false;

  // IPv4 CIDR
  if (range.includes('/') && net.isIPv4(ip)) {
    const [rangeIp, subnetStr] = range.split('/');
    if (!net.isIPv4(rangeIp)) return false;
    
    const subnet = parseInt(subnetStr, 10);
    if (isNaN(subnet) || subnet < 0 || subnet > 32) return false;

    const mask = subnet === 0 ? 0 : (0xffffffff << (32 - subnet)) >>> 0;
    return (ipToLong(ip) & mask) === (ipToLong(rangeIp) & mask);
  }

  return false;
}
