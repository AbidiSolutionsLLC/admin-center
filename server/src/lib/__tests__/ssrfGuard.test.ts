// L1 (E4 review): SSRF range checks and connect-time IP pinning. No database, no external network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { isPrivateAddress, resolveSafeSubscriber, assertSafeSubscriberUrl, postPinned } from '../ssrfGuard';

const servers: http.Server[] = [];
after(() => { for (const s of servers) s.close(); });

test('blocks every non-public range named in the review (and common bypass encodings)', () => {
  const blocked = [
    '0.0.0.0', '10.1.2.3', '127.0.0.1', '127.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '255.255.255.255',
    '198.18.0.1', '198.19.255.255', '192.0.2.1', '198.51.100.7', '203.0.113.9', '168.63.129.16',
    '::', '::1', '::1.2.3.4', '::102:304', '64:ff9b::1.2.3.4', '64:ff9b::7f00:1', '2002:c000:204::1', '2001::1', '2001:0:4136:e378::1', '100::1',
    'fc00::1', 'fd12:3456::1', 'fe80::1', 'fe80::1%eth0', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a00:1',
    'not-an-ip', '', '127.1', '0x7f.1',
  ];
  const leaked = blocked.filter((a) => !isPrivateAddress(a));
  assert.deepEqual(leaked, []);
});

test('allows public unicast addresses (incl. IPv4-mapped public)', () => {
  for (const ok of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateAddress(ok), false, ok);
  }
});

test('resolveSafeSubscriber: scheme, credentials and literal-address rules', async () => {
  const prev = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(() => resolveSafeSubscriber('http://8.8.8.8/x'), /https/);
    await assert.rejects(() => resolveSafeSubscriber('ftp://8.8.8.8/x'), /https/);
    await assert.rejects(() => resolveSafeSubscriber('https://user:pw@8.8.8.8/x'), /Credentials/);
    await assert.rejects(() => resolveSafeSubscriber('https://10.0.0.1/x'), /disallowed/);
    await assert.rejects(() => resolveSafeSubscriber('https://[::1]/x'), /disallowed/);
    await assert.rejects(() => resolveSafeSubscriber('https://[64:ff9b::7f00:1]/x'), /disallowed/);
    await assert.rejects(() => resolveSafeSubscriber('http://127.0.0.1/x'), /https/);
    await assert.rejects(() => resolveSafeSubscriber('https://localhost/x'), /disallowed/); // resolves to loopback
    const ok = await resolveSafeSubscriber('https://8.8.8.8/hook');
    assert.equal(ok.address, '8.8.8.8');
    assert.equal(ok.family, 4);
    const ok6 = await resolveSafeSubscriber('https://[2606:4700:4700::1111]/hook');
    assert.equal(ok6.address, '2606:4700:4700::1111');
    assert.equal(ok6.family, 6);
  } finally { process.env.NODE_ENV = prev; }
  // development keeps the loopback exemption (no pin needed)
  const dev = await assertSafeSubscriberUrl('http://127.0.0.1:9/hook');
  assert.equal(dev.hostname, '127.0.0.1');
});

test('postPinned connects to the pinned address even though the hostname cannot resolve, keeping Host', async () => {
  let seenHost = '';
  let seenBody = '';
  const server = http.createServer((req, res) => {
    seenHost = String(req.headers.host);
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => { seenBody = b; res.statusCode = 204; res.end(); });
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  // "pinned.invalid" never resolves (RFC 6761): reaching the server proves the connection used the pinned address, not DNS.
  const status = await postPinned(
    { url: new URL(`http://pinned.invalid:${port}/hook`), address: '127.0.0.1', family: 4 },
    { headers: { 'content-type': 'application/json' }, body: '{"a":1}', timeoutMs: 3000 },
  );
  assert.equal(status, 204);
  assert.equal(seenHost, `pinned.invalid:${port}`);
  assert.equal(seenBody, '{"a":1}');
});

test('postPinned: without a pin the unresolvable hostname fails (control), non-2xx is returned, redirects are not followed', async () => {
  await assert.rejects(() => postPinned({ url: new URL('http://pinned.invalid:9/hook') }, { headers: {}, body: '{}', timeoutMs: 3000 }));
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    if (req.url === '/redirect') { res.statusCode = 302; res.setHeader('location', '/final'); res.end(); return; }
    res.statusCode = 200; res.end('final');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  const status = await postPinned({ url: new URL(`http://127.0.0.1:${port}/redirect`) }, { headers: {}, body: '{}', timeoutMs: 3000 });
  assert.equal(status, 302);
  assert.equal(hits, 1);
});

test('postPinned times out on a stalled subscriber', async () => {
  const server = http.createServer(() => { /* never responds */ });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  await assert.rejects(() => postPinned({ url: new URL(`http://127.0.0.1:${port}/hook`) }, { headers: {}, body: '{}', timeoutMs: 300 }));
});
