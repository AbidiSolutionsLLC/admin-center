// server/src/scripts/gen-admin-backend-key.ts — npm run gen:admin-backend-key
// Writes .local/keys/admin-backend.pem (PKCS#8, git-ignored) and prints the PUBLIC JWKS to set as SERVICES_ADMIN_BACKEND_JWKS.
// Set ADMIN_BACKEND_CLIENT_KEY to the .pem path (or inline PEM). The private key is never printed.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as jose from 'jose';
import { adminBackendKeyId } from '../platform/productsInternalToken';

async function main() {
  const dir = path.join(__dirname, '../../.local/keys');
  const file = path.join(dir, 'admin-backend.pem');
  if (fs.existsSync(file)) throw new Error(`${file} already exists; delete it first to rotate the key`);
  fs.mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const jwk = publicKey.export({ format: 'jwk' }) as jose.JWK;
  const kid = await adminBackendKeyId(jwk);
  console.log(`Private key written to ${file}`);
  console.log('SERVICES_ADMIN_BACKEND_JWKS=' + JSON.stringify({ keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] }));
  console.log(`ADMIN_BACKEND_CLIENT_KEY=${file}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
