// server/src/identity/recoveryCodes.ts
// Recovery codes management for tenant identities (03 §4.4, D-8).
import crypto from 'crypto';
import type { IIdentity } from '../models/Identity.model';

export const RECOVERY_CODES_COUNT = 10;

export function normalizeRecoveryCode(code: string): string {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  const norm = normalizeRecoveryCode(code);
  return crypto.createHash('sha256').update(norm).digest('hex');
}

export function generateRecoveryCodes(count = RECOVERY_CODES_COUNT): { plaintext: string[]; hashed: string[] } {
  const plaintext: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plaintext.push(formatted);
    hashed.push(hashRecoveryCode(formatted));
  }
  return { plaintext, hashed };
}

/**
 * Checks whether code matches an unconsumed recovery code hash on the identity.
 * If found, removes the matching hash from identity.mfa.recovery_codes_hash and returns true.
 * Note: Caller must save the identity document.
 */
export function consumeRecoveryCode(identity: IIdentity, code: string): boolean {
  if (!identity.mfa || !Array.isArray(identity.mfa.recovery_codes_hash) || identity.mfa.recovery_codes_hash.length === 0) {
    return false;
  }
  const norm = normalizeRecoveryCode(code);
  if (!norm) return false;
  const hash = hashRecoveryCode(norm);
  const idx = identity.mfa.recovery_codes_hash.indexOf(hash);
  if (idx === -1) return false;
  identity.mfa.recovery_codes_hash.splice(idx, 1);
  return true;
}
