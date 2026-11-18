// server/src/lib/__tests__/backchannelLogout.test.ts — Back-Channel Logout 1.0 token shape (DRD §8.6). Pure: no database, no keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logoutTokenClaims, LOGOUT_EVENT, BACKCHANNEL_JOB, membersWithoutPortal } from '../backchannelLogout';

test('logout token claims: iss, aud = client id, sub, sid, jti and the logout event; no nonce', () => {
  const c = logoutTokenClaims({ issuer: 'https://id.example/realms/tenant', clientId: 'karbexa-assets', sub: 'm1', sid: 's1', jti: 'j1' });
  assert.equal(c.iss, 'https://id.example/realms/tenant');
  assert.equal(c.aud, 'karbexa-assets');
  assert.equal(c.sub, 'm1');
  assert.equal(c.sid, 's1');
  assert.equal(c.jti, 'j1');
  assert.deepEqual(c.events, { [LOGOUT_EVENT]: {} });
  assert.equal('nonce' in c, false);
});

test('each logout token has its own jti', () => {
  const a = logoutTokenClaims({ issuer: 'i', clientId: 'c', sub: 's', sid: 'x' });
  const b = logoutTokenClaims({ issuer: 'i', clientId: 'c', sub: 's', sid: 'x' });
  assert.notEqual(a.jti, b.jti);
  assert.equal(BACKCHANNEL_JOB, 'standalone.backchannel_logout');
});

test('membersWithoutPortal: per standalone portal, the members whose access no longer lists it', () => {
  const entries = [
    { member_id: 'm1', keys: ['people', 'assets'] },
    { member_id: 'm2', keys: ['people'] },
    { member_id: 'm3', keys: ['people', 'zyntrus'] },
  ];
  assert.deepEqual(membersWithoutPortal(entries, ['assets', 'zyntrus']), { assets: ['m2', 'm3'], zyntrus: ['m1', 'm2'] });
});

test('membersWithoutPortal: nobody lost a portal, no standalone portals, or no members: empty', () => {
  assert.deepEqual(membersWithoutPortal([{ member_id: 'm1', keys: ['assets'] }], ['assets']), {});
  assert.deepEqual(membersWithoutPortal([{ member_id: 'm1', keys: [] }], []), {});
  assert.deepEqual(membersWithoutPortal([], ['assets']), {});
});
