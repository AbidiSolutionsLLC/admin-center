import { isIpInRange, isValidIpOrCidr } from '../utils/ipUtils';
declare var process: any;

async function runTests() {
  console.log("=== UNIT TESTS: IP VALIDATION & CIDR ===");
  const ipTests = [
    { ip: '192.168.1.10', range: '192.168.1.10', expected: true, desc: 'IPv4 exact match' },
    { ip: '192.168.2.50', range: '192.168.1.0/24', expected: false, desc: 'IPv4 outside CIDR' },
    { ip: '2001:db8::50', range: '2001:db8::/32', expected: true, desc: 'IPv6 CIDR match' },
    { ip: '2001:db9::50', range: '2001:db8::/32', expected: false, desc: 'IPv6 CIDR mismatch' },
    { ip: '192.168.1.1', range: '2001:db8::/32', expected: false, desc: 'IPv4 vs IPv6' },
  ];
  let failCount = 0;
  for (const tc of ipTests) {
    const result = isIpInRange(tc.ip, tc.range);
    if (result !== tc.expected) {
      console.error(`[FAIL] ${tc.desc} - Expected ${tc.expected}, Got ${result}`);
      failCount++;
    } else {
      console.log(`[PASS] ${tc.desc}`);
    }
  }

  const validTests = [
    { val: '192.168.1.1', expected: true },
    { val: '2001:db8::1', expected: true },
    { val: '192.168.1.0/24', expected: true },
    { val: '2001:db8::/32', expected: true },
    { val: '999.999.999.999', expected: false },
    { val: '192.168.1.0/33', expected: false },
    { val: 'random string', expected: false },
    { val: '192.168.1.1:80', expected: false },
  ];
  for (const tc of validTests) {
    const result = isValidIpOrCidr(tc.val);
    if (result !== tc.expected) {
      console.error(`[FAIL] Validation: ${tc.val} - Expected ${tc.expected}, Got ${result}`);
      failCount++;
    } else {
      console.log(`[PASS] Validation: ${tc.val} (valid=${tc.expected})`);
    }
  }

  if (failCount > 0) {
    console.error(`\nFailed ${failCount} tests.`);
    process.exit(1);
  } else {
    console.log(`\nAll IP unit tests passed!`);
    process.exit(0);
  }
}

runTests().catch(console.error);
