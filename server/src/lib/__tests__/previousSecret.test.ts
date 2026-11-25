// server/src/lib/__tests__/previousSecret.test.ts — a rotated-out client secret stays valid for 24 h (DRD §8.2).
// Regression (2026-11-25 browser test ZY-1): the check read camelCase names that oidc-provider never sets on a Client,
// so the old secret was refused straight after a rotation. This test builds the Client through oidc-provider itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXTRA_CLIENT_METADATA, previousSecretMatches } from '../standalonePortals';

const { Provider } = require('oidc-provider') as { Provider: any };

const nowS = () => Math.floor(Date.now() / 1000);

async function clientWith(extra: Record<string, unknown>) {
  const provider = new Provider('http://localhost:9', {
    clients: [{
      client_id: 'karbexa-qa', client_secret: 'current-secret', redirect_uris: ['https://qa.example.com/cb'],
      grant_types: ['authorization_code'], response_types: ['code'], ...extra,
    }],
    extraClientMetadata: { properties: [...EXTRA_CLIENT_METADATA] },
  });
  return provider.Client.find('karbexa-qa');
}

test('previousSecretMatches: the rotated-out secret is accepted on a real oidc-provider Client until it expires', async () => {
  const live = await clientWith({ karbexa_previous_secret: 'old-secret', karbexa_previous_secret_expires_at: nowS() + 3600 });
  assert.equal(previousSecretMatches(live, 'old-secret'), true);
  assert.equal(previousSecretMatches(live, 'wrong'), false);
  assert.equal(await live.compareClientSecret('current-secret'), true);

  const expired = await clientWith({ karbexa_previous_secret: 'old-secret', karbexa_previous_secret_expires_at: nowS() - 1 });
  assert.equal(previousSecretMatches(expired, 'old-secret'), false);

  const none = await clientWith({});
  assert.equal(previousSecretMatches(none, 'old-secret'), false);
  assert.equal(previousSecretMatches(none, undefined), false);
});

test('previousSecretMatches: rejects non-string input and a missing expiry', () => {
  assert.equal(previousSecretMatches({ karbexa_previous_secret: 'old' }, 'old'), false);
  assert.equal(previousSecretMatches({ karbexa_previous_secret: 'old', karbexa_previous_secret_expires_at: nowS() + 60 }, 123), false);
  assert.equal(previousSecretMatches({ karbexa_previous_secret: '', karbexa_previous_secret_expires_at: nowS() + 60 }, ''), false);
});
