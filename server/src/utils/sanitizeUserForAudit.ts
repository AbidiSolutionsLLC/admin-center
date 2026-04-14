// server/src/utils/sanitizeUserForAudit.ts
type UserDoc = Record<string, unknown>;

/**
 * Sanitizes a user document for audit logging by removing sensitive fields.
 * This prevents password_hash and refresh_token_hash from appearing in audit logs.
 * FIX-08: Strip password_hash from Audit Log Snapshots
 */
export function sanitizeUserForAudit(user: UserDoc): UserDoc {
  const {
    password_hash,
    refresh_token_hash,
    // add any other sensitive fields here
    ...safeFields
  } = user;
  return safeFields;
}
