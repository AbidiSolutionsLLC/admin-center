# Identity service (hosted sign-in, OIDC realms)

Reference for the embedded OIDC identity provider that runs inside the Admin Express server. Read from the code on branch `chore/wrapup`; paths are repo-relative. Spec background: `ecosystem-planning/phase-1-architecture/03` (identity) and `09` (operator realm). Where they differ, the code is described.

The platform API (`/platform/v1`) and the event dispatcher are documented separately in [platform-api.md](platform-api.md). See also [admin.md](admin.md), [operator.md](operator.md), [../CONFIGURATION.md](../CONFIGURATION.md).

---

## 1. Purpose and users

- **Who signs in here:** customer members of every Karbexa app (tenant realm), Karbexa staff (operator realm), and machine clients (services realm, client credentials only).
- **What it does:** issues RS256 JWT access tokens per audience, hosts the login / TOTP / enrolment / Microsoft Entra pages, keeps the Karbexa `Session` record that every API uses for revocation, and serves a self-service account page for tenant users.
- **Library:** `oidc-provider` ~9.13 (ESM, loaded with `require(esm)`, so Node ≥ 22.12 is required; `assertRequireModule()` in `server/src/identity/config.ts` fails startup otherwise).

## 2. Where the code is

| File | Holds |
|---|---|
| `server/src/identity/config.ts` | Realm names, client ids, audiences, scopes, lifetimes, `getIdentityConfig()` (env), `getClientAllowedProducts()` |
| `server/src/identity/providers.ts` | One `Provider` per realm: clients, TTLs, features, `extraTokenClaims`, `loadExistingGrant`, logout pages |
| `server/src/identity/index.ts` | `initIdentity()` (keys, indexes, providers) and `mountIdentity(app)` |
| `server/src/identity/interactions.ts` | Tenant hosted login: password, TOTP, enrolment, recovery code, Entra federation, abort |
| `server/src/operator/interactions.ts` | Operator hosted login: password, mandatory TOTP / enrolment, abort |
| `server/src/identity/account.ts` | Tenant account page `/realms/tenant/account` (password, TOTP, recovery codes, sessions) |
| `server/src/identity/accounts.ts` | `loadAccessContext`, `pickMembership`, `findAccount` (tenant) |
| `server/src/identity/sessions.ts` | `ensureSessionForToken`, `findLiveSession`, `revokeSession`, `revokeSessionsTx`, `revokeIdentitySessions`, `destroyProviderSession` |
| `server/src/identity/keys.ts` | Realm signing keys and cookie keys (env or `server/.local/`) |
| `server/src/identity/mongoAdapter.ts` | oidc-provider storage on the Mongoose connection |
| `server/src/identity/recoveryCodes.ts` | Recovery code generation / hashing / consumption |
| `server/src/identity/html.ts` | Page shell, CSP, per-client skin (`shellForClient`) |
| `server/src/controllers/auth.controller.ts` | Login policy helpers used by the interactions (lockout, IP policy, password expiry, security events), password setup / reset, logout |
| `server/src/middleware/auth.ts`, `server/src/operator/middleware.ts`, `server/src/platform/requireServiceToken.ts` | Token verification for the three APIs |

Mount order (`server/src/app.ts`): `requireOperatorIp` on `/realms/operator`, then `mountIdentity(app)`, **before** CORS, helmet and body parsers. The interaction and account routes are registered before the provider callbacks (`/realms/tenant`, `/realms/operator`, `/realms/services`) and parse their own form bodies.

## 3. Pages and API endpoints

### 3.1 Realms, clients, audiences

Issuer origin `ID_ISSUER_ORIGIN` (default `http://id.karbexa.localhost:5000`, must be https in production). Each realm issuer is `${ID_ISSUER_ORIGIN}/realms/<realm>`.

| Realm | Client id | Auth method | Grants | Redirect URIs | Post-logout URIs | Audience (resource) | Scopes |
|---|---|---|---|---|---|---|---|
| tenant | `karbexa-admin-spa` | none (public, PKCE required) | authorization_code, refresh_token | `${ADMIN_SPA_ORIGIN}/auth/callback` | `${ADMIN_SPA_ORIGIN}/login`, `${ADMIN_SPA_ORIGIN}/login?signed_out=1` | `urn:karbexa:admin` | `openid profile email` + resource scope `api` |
| tenant | `karbexa-products-spa` | none (PKCE) | authorization_code, refresh_token | `${PRODUCTS_SPA_ORIGIN}/auth/callback` | `${PRODUCTS_SPA_ORIGIN}/login`, `.../login?signed_out=1` | `urn:karbexa:products` | same |
| operator | `karbexa-operator-spa` | none (PKCE) | authorization_code, refresh_token | `${OPERATOR_SPA_ORIGIN}/operator/callback` | `${OPERATOR_SPA_ORIGIN}/operator` | `urn:karbexa:operator` | same |
| services | `karbexa-products-backend` | `private_key_jwt` (RS256), JWKS from `SERVICES_PRODUCTS_BACKEND_JWKS` | client_credentials | none | none | `urn:karbexa:platform-api` | `platform.org.read platform.members.read platform.access.read platform.sessions.read platform.events.read platform.role_catalog.write` |
| services | `karbexa-admin-backend` | `private_key_jwt`, JWKS from `SERVICES_ADMIN_BACKEND_JWKS` | client_credentials | none | none | `urn:karbexa:products-internal` | `products.internal.read` |

Notes:
- Outside production, each SPA client also accepts `http://localhost:<port>` and `http://127.0.0.1:<port>` variants of its origin (`devOrigins` in `providers.ts`).
- A services client is registered only when its JWKS env var is set.
- Each SPA client may obtain exactly one audience; any other `resource` gives `invalid_target` (`getResourceServerInfo`).
- No consent screen: `loadExistingGrant` builds the grant for first-party clients.
- CORS on the provider endpoints is client-based: the request origin must match a redirect URI origin of a public client.

### 3.2 OIDC endpoints (per realm, under `/realms/<realm>`)

Routes come from `ROUTES` in `providers.ts`.

| Path | tenant | operator | services |
|---|---|---|---|
| `/.well-known/openid-configuration` | yes | yes | yes |
| `/oauth/authorize` | yes | yes | (no response types) |
| `/oauth/token` | yes | yes | yes (client_credentials) |
| `/oauth/jwks` | yes | yes | yes |
| `/oauth/revoke` | yes | yes | yes |
| `/oauth/end_session` | yes | yes | no |
| `/oauth/userinfo` | yes | yes | disabled |

Disabled everywhere: dev interactions, device flow. Introspection is not enabled.

### 3.3 Hosted pages and form endpoints (server-rendered)

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/realms/tenant/interaction/:uid` | `interactions.ts` | Renders the current step: login, TOTP, or enrolment (QR + setup key). Consent prompts are auto-granted |
| POST | `/realms/tenant/interaction/:uid/login` | `interactions.ts` | email + password; `authLimiter` |
| POST | `/realms/tenant/interaction/:uid/totp` | `interactions.ts` | 6-digit TOTP or a recovery code; `authLimiter` |
| POST | `/realms/tenant/interaction/:uid/enrol` | `interactions.ts` | First-login TOTP enrolment; `authLimiter` |
| GET | `/realms/tenant/interaction/:uid/abort` | `interactions.ts` | Ends with `access_denied` |
| GET | `/realms/tenant/interaction/:uid/entra` | `interactions.ts` | Starts Microsoft sign-in (only if `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are set) |
| GET | `/realms/tenant/federation/entra/callback` | `interactions.ts` | Entra redirect URI; bounces to `.../interaction/<uid>/entra/return` |
| GET | `/realms/tenant/interaction/:uid/entra/return` | `interactions.ts` | Code exchange, id_token validation, account resolution |
| GET | `/realms/tenant/account` | `account.ts` | Account page (needs a live tenant session cookie or an Admin Bearer token; else redirect to `${ADMIN_SPA_ORIGIN}/login`) |
| POST | `/realms/tenant/account/password` | `account.ts` | Change password (refused for identities with federated links); revokes all other sessions |
| POST | `/realms/tenant/account/totp/initiate`, `/totp/confirm` | `account.ts` | (Re-)enrol TOTP; pending secret in an encrypted cookie `tenant_account_totp_pending` (10 min) |
| POST | `/realms/tenant/account/recovery-codes` | `account.ts` | Generate 10 new recovery codes (replaces the old set) |
| POST | `/realms/tenant/account/sessions/revoke`, `/sessions/revoke-others` | `account.ts` | Revoke one / all other sessions of the identity |
| GET | `/realms/operator/interaction/:uid` | `operator/interactions.ts` | Login, MFA or enrolment (setup key + otpauth link) |
| POST | `/realms/operator/interaction/:uid/login` | `operator/interactions.ts` | `authLimiter` |
| POST | `/realms/operator/interaction/:uid/mfa` | `operator/interactions.ts` | Verifies TOTP; on enrolment stores the secret; `authLimiter` |
| GET | `/realms/operator/interaction/:uid/abort` | `operator/interactions.ts` | |

All account-page POSTs require a CSRF token: HMAC-SHA256 of `sid:timestamp` with the first cookie key, max age 2 h (`createCsrfToken` / `verifyCsrfToken` in `account.ts`).

Tenant-API endpoints that belong to the identity flow (see admin.md): `POST /api/v1/auth/logout`, `POST /api/v1/auth/setup-password`, `POST /api/v1/auth/request-password-reset`, `POST /api/v1/auth/reset-password`, `POST /api/v1/people/verify-invite`, `POST /api/v1/people/:id/mfa-reset`.

### 3.4 Tenant login flow

1. SPA (`client/src/lib/oidc.ts` `startLogin`) redirects to `/realms/tenant/oauth/authorize` with `response_type=code`, PKCE S256, `state`, `nonce`, `scope=openid profile email`, `resource=urn:karbexa:admin`.
2. Provider creates an interaction and redirects to `/realms/tenant/interaction/<uid>`. The interaction cookie is SameSite=Lax and path-scoped; every handler checks that the URL uid equals the cookie's interaction (`details()`).
3. **Password** (`POST .../login`):
   - Unknown email or no password hash: bcrypt against a dummy hash, generic error "Incorrect email or password." (same response for unknown email and wrong password).
   - Membership: `pickMembership` = oldest `User` of the identity in an access state (`onboarding`, `active`, `probation`, `on_leave`).
   - SSO enforcement: if the member's org has an `active` connection with `enforce_sso: true` and the email domain is verified on it, local login is refused with "Single sign-on is required...".
   - Then: security event, org IP policy (`evaluateLoginIpPolicy`), lockout (`isLocked`), password check (`recordPasswordFailure` locks `User.locked_until` after `max_failed_login_attempts` failures in 30 min, default 5, for `lockout_duration_minutes`, default 30), password expiry, `loadAccessContext`.
4. **Second factor is always required for local login.** If the identity has TOTP enabled → TOTP step; otherwise → enrolment with a new secret (stored encrypted in the interaction result). 5 wrong codes end the interaction with `access_denied`. A recovery code is accepted in the TOTP step and consumed.
5. `finishLogin` records success and finishes the interaction with `amr` = first factor (`pwd` or `fed`) plus `otp` (TOTP) or `mfa_recovery` (recovery code), or `['fed','mfa']` when Entra already did MFA.
6. Provider redirects to the SPA callback with `code`; the SPA exchanges it at `/oauth/token` (`completeLogin`) and keeps tokens in memory (`useAuthStore`, no persistence).
7. At every access-token issuance `extraTokenClaims` re-checks `loadAccessContext` (identity active, membership in an access state, org active). On failure the session is revoked and the grant fails. It also upserts / slides the Karbexa `Session` (`ensureSessionForToken`).

### 3.5 Microsoft Entra federation

- Enabled when `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are set (one platform multi-tenant app). Register the redirect URI `${ID_ISSUER_ORIGIN}/realms/tenant/federation/entra/callback`.
- Authority `https://login.microsoftonline.com/organizations/oauth2/v2.0`, PKCE S256, `prompt=select_account`. State, nonce and verifier are kept in an encrypted cookie `tenant_entra` (10 min, path `/realms/tenant`).
- id_token verified against `https://login.microsoftonline.com/common/discovery/v2.0/keys`, audience = client id, issuer `https://login.microsoftonline.com/<tid>/v2.0`, nonce and `oid` required.
- Tenant mapping: an `IdentityProviderConnection` with `type: 'entra'`, `status: 'active'`, `config.tenant_id = <tid>`. Activating a connection (tenant API) requires a verified domain and an operator approval of that tenant id.
- Account mapping: **only** by an existing `Identity.federated_links` entry with `{ issuer, subject: oid }` whose `connection_id` is that connection. No link → "No Karbexa account is linked...". JIT provisioning is not implemented in the login path (the `jit_provisioning` setting is stored only).
- MFA: if the Entra token's `amr` contains `mfa`, login completes with `['fed','mfa']`; otherwise the TOTP step / enrolment runs.

### 3.6 Logout and revocation

- Admin SPA logout (`client/src/components/layout/Sidebar.tsx`): `POST /api/v1/auth/logout` → `revokeSession(sid, 'user_logout')` → response `end_session_url` = `${tenantIssuer}/oauth/end_session?client_id=karbexa-admin-spa&post_logout_redirect_uri=${ADMIN_SPA_ORIGIN}/login?signed_out=1`. The browser goes there; the logout page auto-submits the confirm form (nonce'd script), and `end_session.success` revokes the session again (idempotent).
- `revokeSession` marks the `Session` `revoked_at` + reason and emits `session.revoked` in a transaction, then deletes the provider session, its grants and their codes / refresh / access tokens (`destroyProviderSession`).
- Other revocation callers: admin force logout, member lifecycle changes, admin MFA reset, password reset (`revokeIdentitySessions`), account-page password change and session revoke, org suspend / close (operator), failed access re-check at token issuance.
- `requireAuth` checks `findLiveSession(sid)` on every Admin API request, so a revoked session stops working immediately, even with an unexpired access token.

## 4. Roles and permissions (claims, lifetimes, keys)

### 4.1 Access token claims

| Realm | Standard | Extra claims (`extraTokenClaims`) |
|---|---|---|
| tenant | `iss`, `sub` (= `User._id`, the membership), `aud` (`urn:karbexa:admin` or `urn:karbexa:products`), `exp`, `iat`, `jti`, `client_id`, `scope`; header `typ: at+jwt`, RS256 | `idn` (Identity id), `org` (company id), `sid`, `org_roles` (names of all org roles), `apps: []` (always empty; comment: "UX hint only... later sprint"), `authz_ver`, `amr`, `token_use: 'access'`, `email` |
| operator | `sub` = `OperatorAccount._id`, `aud` `urn:karbexa:operator` | `email`, `roles`, `sid`, `token_use: 'access'`, `amr` |
| services | `client_id`, `scope`, `aud` | `token_use: 'service'` |

ID token claims: `sub`, `email`, `email_verified`, `name` (`claims` config; `conformIdTokenClaims: true`).

Who may sign in:
- Tenant: identity `status: 'active'`; membership `lifecycle_state` in `ACCESS_STATES` (`onboarding`, `active`, `probation`, `on_leave`); org `status` active and `is_active !== false`.
- Operator: `OperatorAccount.status === 'active'` and `roles` includes `platform_admin`.

### 4.2 Lifetimes (`server/src/identity/config.ts`, `providers.ts`)

| Item | Tenant | Operator | Services |
|---|---|---|---|
| Access token | 600 s | 600 s | 600 s (`ClientCredentials`) |
| Authorization code | 60 s | 60 s | n/a |
| ID token | 600 s | 600 s | n/a |
| Interaction | 3600 s | 3600 s | n/a |
| Refresh token (rotating) | 7 days | 30 min | n/a |
| Provider session / grant | 7 days | 30 min | n/a |
| Karbexa `Session` idle | 12 h, slid at each token issuance, capped at absolute | none (no `Session` rows) | n/a |
| Karbexa `Session` absolute | 7 days | none | n/a |
| Platform API token max age accepted | | | 15 min (`maxTokenAge` in `requireServiceToken.ts`) |

`findLiveSession` (used by `requireAuth`) checks `revoked_at` and `absolute_expires_at` only; idle expiry is enforced at token issuance (`ensureSessionForToken`).

### 4.3 Cookies

oidc-provider cookies are named per realm: `<realm>_sess`, `<realm>_int`, `<realm>_resume`; httpOnly, SameSite=Lax, signed, `secure` when the issuer is https. Each realm signs with keys derived from `OIDC_COOKIE_KEYS` by HMAC-SHA256(`oidc-cookies:<realm>`). Other cookies: `tenant_entra`, `tenant_account_totp_pending` (both AES-256-GCM encrypted with `ENCRYPTION_KEY`).

### 4.4 Keys (`server/src/identity/keys.ts`)

| Key | Env var | Format | Dev fallback |
|---|---|---|---|
| Tenant signing key | `IDENTITY_TENANT_KEY` | PKCS#8 PEM (`\n` escapes allowed), private RSA JWK, or JWKS `{"keys":[current, previous]}` | `server/.local/keys/tenant.json`, generated on first start (RS256, 2048-bit, kid `tenant-<YYYY-MM>-<hex>`) |
| Services signing key | `IDENTITY_SERVICES_KEY` | same | `server/.local/keys/services.json` |
| Operator signing key | `IDENTITY_OPERATOR_KEY` | same | `server/.local/keys/operator.json` |
| Cookie keys | `OIDC_COOKIE_KEYS` | comma list, newest first | `server/.local/cookie-keys.json` |
| Admin backend client key | `ADMIN_BACKEND_CLIENT_KEY` | PKCS#8 PEM inline or a file path | `npm run gen:admin-backend-key` writes `server/.local/keys/admin-backend.pem` and prints `SERVICES_ADMIN_BACKEND_JWKS` |

In production a missing realm key or cookie key stops startup. `kid`s are forced to start with `<realm>-`. The JWKS form exists for rotation: every key in it is passed to the provider and its public part is used for local verification (`getPublicJwks`). Which key the provider picks for signing is decided by `oidc-provider`, not by Karbexa code. `server/.local/` is git-ignored (`server/.gitignore`).

### 4.5 Page skin (`shellForClient` in `server/src/identity/html.ts`)

One layout (left brand panel + card). The theme follows the OIDC client of the interaction:

| Client | Theme | Badge | "to continue to" |
|---|---|---|---|
| `karbexa-admin-spa` | dark | Admin | Karbexa Admin |
| `karbexa-products-spa` | light | none | Karbexa |
| `karbexa-operator-spa` (and every operator realm page via `OPERATOR_SHELL`) | dark | Operator (red) + "Karbexa staff only" note | Karbexa Operator console |
| unknown / none | follows `prefers-color-scheme` | none | none |

Every page sets a per-response nonce CSP: `default-src 'none'`, nonce'd style and script, `img-src 'self' data:`, `form-action 'self'` plus the three SPA origins (and localhost variants outside production), `frame-ancestors 'none'`, `base-uri 'none'`. No external assets; the TOTP QR code is a local PNG data URI.

## 5. Data models

| Model / collection | Key fields | File |
|---|---|---|
| `Identity` (`identities`) | `email` (unique), `email_verified_at`, `full_name`, `password_hash` (bcrypt), `previous_password_hashes`, `password_changed_at`, `mfa.{totp_secret_enc, totp_enabled, recovery_codes_hash[], email_otp_enabled}`, `federated_links[{connection_id, issuer, subject, linked_at}]`, `status`, `failed_login_attempts`, `locked_until`, `last_login_at` | `server/src/models/Identity.model.ts` |
| `User` (`users`) | membership: `identity_id`, `company_id`, `lifecycle_state`, `authz_ver`, `locked_until` | `server/src/models/User.model.ts` |
| `Session` (`sessions`) | `_id` = provider session uid = `sid`, `identity_id`, `member_id`, `company_id`, `realm` (`tenant`/`operator`), `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoked_reason`, `amr`, `ip`, `user_agent` | `server/src/models/Session.model.ts` |
| `OperatorAccount` (`operatoraccounts`) | `email`, `password_hash`, `mfa.{enabled, secret_enc, verified_at}`, `roles`, `status` | `server/src/models/OperatorAccount.model.ts` |
| `IdentityProviderConnection` | `company_id`, `type`, `status`, `config.tenant_id`, `domains[{domain, verification_token, verified_at}]`, `verified_domains`, `tenant_approval`, `jit_provisioning`, `enforce_sso` | `server/src/models/IdentityProviderConnection.model.ts` |
| `SecurityEvent` | login / MFA / logout events | `server/src/models/SecurityEvent.model.ts` |
| `Invitation` (kind, state `pending/accepted/revoked/superseded`, no TTL index; replaces `InviteToken`), `PasswordResetToken` | sha256 `token_hash`, `expires_at` | `server/src/models/` |
| `oidc_<realm>_<Model>` | `{ _id, payload, expiresAt }` with TTL index on `expiresAt`, indexes on `payload.grantId`, `payload.uid` (+ `payload.sessionUid` for RefreshToken). Tenant and operator: Session, Interaction, Grant, AuthorizationCode, RefreshToken, AccessToken, ReplayDetection. Services: ClientCredentials, ReplayDetection | `server/src/identity/mongoAdapter.ts` |

## 6. Platform events emitted

| Event | Where | `data` |
|---|---|---|
| `session.revoked` | `revokeSessionsTx` in `server/src/identity/sessions.ts` (one per revoked tenant session) | `{ sid, member_id }` |

Login and MFA activity is written to `SecurityEvent`, not to platform events.

## 7. Status

### Built ✓
- Three realms with separate keys, issuers, audiences, cookie keys: `providers.ts`, `keys.ts`.
- Tenant hosted login with uniform error for unknown email, lockout, IP policy, password expiry, SSO enforcement, mandatory TOTP with first-login enrolment (QR), recovery codes: `interactions.ts`.
- Entra federation by verified `(issuer, oid)` link, with upstream MFA acceptance.
- Session store with revocation as the source of truth, provider teardown on revoke, `session.revoked` events: `sessions.ts`.
- Account page (password, TOTP re-enrol, recovery codes, sessions): `account.ts`.
- Operator realm with mandatory TOTP and IP allow-list.
- Services realm with `private_key_jwt` client credentials for the products backend and the admin backend.

### Not built or partial ✗
- **Entra links cannot be created in the product.** The only code that writes `Identity.federated_links` is `server/src/scripts/seed-e11.ts` (marked not used for go-live). There is no admin or self-service path to link a Microsoft account and no JIT provisioning (`jit_provisioning` is stored by `identityProviders.controller.ts` but not read at login). With the fresh-start go-live, Microsoft sign-in therefore always ends in "No Karbexa account is linked".
- `apps` claim is always `[]` (`providers.ts`, comment "effective-access projection is a later sprint").
- E-mail OTP: `mfa.email_otp_enabled` exists on `Identity` but no login code uses it.
- Operator realm: no `Session` rows, no lockout, no QR on enrolment (operator.md).
- No token introspection endpoint.

### Known issues
- **Account page access states (Plan 0.7g, built, tests not yet run).** `resolveAccountSession` uses `hasAccessState` (`onboarding`, `active`, `probation`, `on_leave`), the same rule as sign-in (`server/src/identity/account.ts`).
- The CSRF secret falls back to `ENCRYPTION_KEY` and then to the literal `'karbexa-account-csrf-secret'` (`account.ts:66`); in practice `loadCookieKeys()` always returns at least one key, so the literal is not reached.
- `applyProxy` in `providers.ts` reads `TRUST_PROXY` with default `'1'` and only sets `maxIpsCount` for a number; a CIDR list makes the provider trust proxies without a hop limit, unlike Express (`lib/trustProxy.ts`).
- After `POST /api/v1/auth/logout` the session is already destroyed, so the following `end_session` call finds no provider session; the redirect still lands on `/login?signed_out=1`.

## 8. Tests and how to run them

From `server/`:

| Command | Coverage |
|---|---|
| `npm run smoke:login` | `src/scripts/smoke-oidc-login.ts`: in-memory replica set, full app in-process. Discovery; authorize with PKCE + resource; identical response for wrong password and unknown email; password → TOTP; resume → `redirect_uri?code=`; token exchange; Admin API call; refresh rotation; services-realm token rejected by `requireAuth`; logout; first login without TOTP → enrolment; RP-initiated logout revokes the `Session` |
| `npm run smoke:sprint2` | Operator realm login with TOTP enrolment; `karbexa-admin-backend` client → products-internal token (L3-4); platform API token checks (see platform-api.md) |
| `npm test` | `identity/__tests__/account.test.ts` (account page), `identity/__tests__/enrol-ui.test.ts` (QR, setup-key format, page shell), `controllers/__tests__/mfaReset.test.ts`, `controllers/__tests__/identityProviders.test.ts`, `lib/__tests__/trustProxy.test.ts`, `lib/__tests__/security-baseline.test.ts` |
