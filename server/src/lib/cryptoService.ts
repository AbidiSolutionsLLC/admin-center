// server/src/lib/cryptoService.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Derives a 256-bit key from the ENCRYPTION_KEY environment variable.
 * Uses SHA-256 hashing to ensure consistent key length.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a Base64-encoded string containing: iv + authTag + ciphertext
 *
 * Format: base64(iv:authTag:ciphertext)
 * - iv: 16 bytes
 * - authTag: 16 bytes
 * - ciphertext: variable length
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted and encode as base64
  const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]);
  return combined.toString('base64');
}

/**
 * Decrypts a Base64-encoded string that was encrypted with AES-256-GCM.
 * Expects format: base64(iv:authTag:ciphertext)
 */
export function decrypt(encryptedBase64: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedBase64, 'base64');

  // Extract iv (first 16 bytes), authTag (next 16 bytes), and ciphertext (rest)
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts an object by stringifying it to JSON first.
 */
export function encryptObject(obj: Record<string, unknown>): string {
  return encrypt(JSON.stringify(obj));
}

/**
 * Decrypts a string back to an object.
 */
export function decryptObject<T>(encrypted: string): T {
  const decrypted = decrypt(encrypted);
  return JSON.parse(decrypted) as T;
}
