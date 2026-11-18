# Identity: data model

All collections are owned by Admin. Products never write them; they learn about changes through events and the Platform API. Tenant key: `company_id` where a model has one. `Identity` is global (one person, many memberships). Collection names are Mongoose defaults (lower-case plural of the model name) unless stated.

## Collections

| Model (file in `server/src/models/` unless noted) | Key fields | Tenant key | Notes |
|---|---|---|---|
| `Identity` (`Identity.model.ts`) | `email` (unique), `email_verified_at`, `full_name`, `password_hash` (bcrypt), `previous_password_hashes`, `password_changed_at`, `mfa.{totp_secret_enc, totp_enabled, recovery_codes_hash[], email_otp_enabled}`, `federated_links[{connection_id, issuer, subject, linked_at}]`, `status`, `failed_login_attempts`, `locked_until`, `last_login_at` | none (global) | `totp_secret_enc` is AES-256-GCM with `ENCRYPTION_KEY` (`lib/cryptoService.ts`). Rotating the key makes secrets undecryptable |
| `User` (`User.model.ts`) | membership: `identity_id`, `company_id`, `lifecycle_state`, `authz_ver`, `locked_until` | `company_id` | Full field list in `../admin-center/DATA-MODEL.md`. `sub` of a tenant token is the `User._id` |
| `Session` (`Session.model.ts`) | `_id` = provider session uid = `sid`, `identity_id`, `member_id`, `company_id`, `realm` (`tenant`), `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoked_reason`, `amr`, `ip`, `user_agent` | `company_id` | Revocation source of truth for `requireAuth`. Idle expiry is enforced at token issuance, absolute expiry and `revoked_at` on every request |
| `OperatorAccount` (`OperatorAccount.model.ts`) | `email`, `full_name`, `password_hash`, `mfa.{enabled, secret_enc, verified_at}`, `roles[]`, `status` (`active`/`suspended`/`invited`), `last_login_at`, `failed_attempts`, `locked_until`, `invited_by` | none (platform) | Operators are not tenant members |
| `OperatorSession` (`OperatorSession.model.ts`) | operator session rows (idle 30 min) | none | Written at each operator token issuance (`operator/sessions.ts`); `requireOperator` rejects a revoked one with 401 `INVALID_TOKEN` (15 s in-process cache) |
| `IdentityProviderConnection` (`IdentityProviderConnection.model.ts`) | `company_id`, `type`, `status`, `config.tenant_id`, `domains[{domain, verification_token, verified_at}]`, `verified_domains`, `tenant_approval.{tenant_id, approved_at, operator_id}`, `jit_provisioning`, `enforce_sso` | `company_id` | `tenant_approval` is written by the operator route only |
| `SecurityEvent` (`SecurityEvent.model.ts`) | login, MFA, logout and lockout events; `company_id` null with `metadata.realm: 'operator'` for operator events | `company_id` | Read by the Admin security page and the Command Center security page |
| `Invitation` (`Invitation.model.ts`) | `kind`, `state` (`pending`/`accepted`/`revoked`/`superseded`; expired is derived), sha256 `token_hash`, `expires_at`, `sent_count`, `last_sent_at` | `company_id` (null for operator invitations) | Kept records, no TTL index. Created only by `lib/invitations.ts` `createInvitation` |
| `PasswordResetToken` (`PasswordResetToken.model.ts`) | sha256 `token_hash`, `expires_at` | via identity | |
| `oidc_<realm>_<Model>` (`identity/mongoAdapter.ts`) | `{ _id, payload, expiresAt }`; TTL index on `expiresAt`; indexes on `payload.grantId`, `payload.uid` (plus `payload.sessionUid` for RefreshToken) | none | Tenant and operator: Session, Interaction, Grant, AuthorizationCode, RefreshToken, AccessToken, ReplayDetection. Services: ClientCredentials, ReplayDetection |
| `RefreshToken` (`RefreshToken.model.ts`) | legacy collection | none | Not written by the current sign-in; only marked revoked in a few paths |

## Lifetimes

| Item | Tenant | Operator | Services |
|---|---|---|---|
| Access token | 600 s | 600 s | 600 s |
| Authorization code | 60 s | 60 s | n/a |
| ID token | 600 s | 600 s | n/a |
| Interaction | 3600 s | 3600 s | n/a |
| Refresh token (rotating) | 7 days | 30 min | n/a |
| Provider session and grant | 7 days | 30 min | n/a |
| Karbexa `Session` idle | 12 h, slid at each token issuance, capped at absolute | 30 min (`OperatorSession`) | n/a |
| Karbexa `Session` absolute | 7 days | none | n/a |
| Platform API token age accepted | | | 15 min (`maxTokenAge` in `platform/requireServiceToken.ts`) |

Sources: `server/src/identity/config.ts`, `providers.ts`. Decision record: `DECISIONS.md` C-1.

## Keys and cookies

| Key | Env var | Format | Dev fallback |
|---|---|---|---|
| Tenant signing key | `IDENTITY_TENANT_KEY` | PKCS#8 PEM (`\n` escapes allowed), private RSA JWK, or JWKS `{"keys":[current, previous]}` | `server/.local/keys/tenant.json`, generated on first start (RS256, 2048 bit, kid `tenant-<YYYY-MM>-<hex>`) |
| Services signing key | `IDENTITY_SERVICES_KEY` | same | `server/.local/keys/services.json` |
| Operator signing key | `IDENTITY_OPERATOR_KEY` | same | `server/.local/keys/operator.json` |
| Cookie keys | `OIDC_COOKIE_KEYS` | comma list, newest first | `server/.local/cookie-keys.json` |
| Admin backend client key | `ADMIN_BACKEND_CLIENT_KEY` | PKCS#8 PEM inline or a file path | `npm run gen:admin-backend-key` writes `server/.local/keys/admin-backend.pem` and prints `SERVICES_ADMIN_BACKEND_JWKS` |

In production a missing realm key or cookie key stops startup. Key ids are forced to start with `<realm>-`. Which key signs is decided by `oidc-provider`, not by Karbexa code. `server/.local/` is git-ignored. oidc-provider cookies are named `<realm>_sess`, `<realm>_int`, `<realm>_resume` (httpOnly, SameSite=Lax, signed, `secure` when the issuer is https); each realm signs with keys derived from `OIDC_COOKIE_KEYS` by HMAC-SHA256 (`oidc-cookies:<realm>`). `tenant_entra` and `tenant_account_totp_pending` are AES-256-GCM encrypted with `ENCRYPTION_KEY`.

## Retention

oidc storage expires by TTL index on `expiresAt`. `Session` rows are kept after revocation (the revocation feed reads them) and removed 30 days after `absolute_expires_at` (TTL index). Invitations are never deleted by a TTL index; `lib/invitationJobs.ts` removes old ones in a nightly retention job. `SecurityEvent` has no TTL index.
