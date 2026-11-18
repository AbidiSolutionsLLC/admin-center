# Identity: architecture

Library: `oidc-provider` ~9.13 (ESM, loaded with `require(esm)`, so Node 22.12 or newer; `assertRequireModule()` in `server/src/identity/config.ts` stops startup otherwise). Repo-wide layout and request pipeline: `../ARCHITECTURE.md`. Token and claim contract: meta repo `docs/architecture/03-IDENTITY-AND-TOKEN-SPEC.md`.

## Layers

| Layer | Files | Job |
|---|---|---|
| Mount | `server/src/app.ts`, `server/src/identity/index.ts` | `requireOperatorIp` on `/realms/operator`, then `mountIdentity(app)` **before** CORS, helmet and body parsers. Interaction and account routes are registered before the provider callbacks and parse their own form bodies |
| Provider | `server/src/identity/providers.ts` | One `Provider` per realm: clients, TTLs, features, `extraTokenClaims`, `loadExistingGrant` (first-party grant, no consent), `getResourceServerInfo` (one audience per client), logout pages |
| Interactions | `server/src/identity/interactions.ts` (tenant), `server/src/operator/interactions.ts` (operator) | Hosted login steps. Every handler checks that the URL uid equals the interaction cookie's (`details()`) |
| Account page | `server/src/identity/account.ts` | Self-service page, session cookie or Admin Bearer token, CSRF token on every POST |
| Policy helpers | `server/src/controllers/auth.controller.ts` | Lockout, IP policy, password expiry, security events, password setup and reset, logout |
| Sessions | `server/src/identity/sessions.ts` | The Karbexa `Session` record and revocation |
| Storage | `server/src/identity/mongoAdapter.ts` | oidc-provider models in `oidc_<realm>_<Model>` collections with TTL indexes |
| Keys | `server/src/identity/keys.ts` | Realm signing keys and cookie keys (env or `server/.local/`) |
| Verification | `server/src/middleware/auth.ts`, `server/src/operator/middleware.ts`, `server/src/platform/requireServiceToken.ts` | Each API verifies tokens locally against its realm's public keys |

## Tenant sign-in flow

1. The SPA (`client/src/lib/oidc.ts` `startLogin`) redirects to `/realms/tenant/oauth/authorize` with `response_type=code`, PKCE S256, `state`, `nonce`, `scope=openid profile email` and `resource=urn:karbexa:admin` (or `urn:karbexa:products`).
2. The provider creates an interaction and redirects to `/realms/tenant/interaction/<uid>` (cookie SameSite=Lax, path-scoped).
3. Password step (`POST .../login`): unknown e-mail or no hash runs bcrypt against a dummy hash and gives the generic error. Membership comes from `pickMembership` (oldest `User` of the identity in an access state). Order of checks: SSO enforcement, security event, organisation IP policy (`evaluateLoginIpPolicy`), lockout (`isLocked`), password check (`recordPasswordFailure` locks after `max_failed_login_attempts`, default 5 in 30 min, for `lockout_duration_minutes`, default 30), password expiry, `loadAccessContext`.
4. A second factor is always required. TOTP enabled gives the TOTP step; otherwise enrolment with a new secret kept encrypted in the interaction result. 5 wrong codes end the interaction with `access_denied`. A recovery code is accepted in the TOTP step and consumed.
5. `finishLogin` records success and finishes with `amr` = `pwd` or `fed`, plus `otp` or `mfa_recovery`; `['fed','mfa']` when Entra already did MFA.
6. The provider redirects to the SPA callback with a code; `completeLogin` exchanges it at `/oauth/token`; tokens live in memory only (`useAuthStore`).
7. At every access-token issuance `extraTokenClaims` re-checks `loadAccessContext`. On failure the session is revoked and the grant fails. It also upserts and slides the `Session` row (`ensureSessionForToken`).

## Microsoft Entra federation

- Enabled when `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are set (one multi-tenant platform app). Redirect URI: `${ID_ISSUER_ORIGIN}/realms/tenant/federation/entra/callback`.
- Authority `https://login.microsoftonline.com/organizations/oauth2/v2.0`, PKCE S256, `prompt=select_account`. State, nonce and verifier sit in the encrypted cookie `tenant_entra` (10 min, path `/realms/tenant`).
- The id_token is verified against Microsoft's published keys: audience = client id, issuer `https://login.microsoftonline.com/<tid>/v2.0`, nonce and `oid` required.
- Tenant mapping: an `IdentityProviderConnection` with `type: 'entra'`, `status: 'active'`, `config.tenant_id = <tid>`. Activating a connection needs a verified domain and an operator approval of the tenant id (`../admin-center/API.md` security section, `../command-center/API.md` identity-providers rows).
- Account mapping (`identity/federationLink.ts`): by an existing `Identity.federated_links` entry `{ issuer, subject: oid }` for that connection. With no link, one is made on first sign-in only when the token e-mail (`email`, else `preferred_username`) has a domain in the connection's **verified** domains, an active Identity with that e-mail exists, it has an access-state membership in the connection's company, and it has no link for this connection yet. The update is conditional (one link per connection) and audited `identity.federation_linked`. Anything else: "No Karbexa account is linked" and a `login_failure` security event with the reason.
- MFA: if the Entra token's `amr` contains `mfa` the login completes with `['fed','mfa']`; otherwise the TOTP step or enrolment runs.

## Logout and revocation

- Admin SPA logout calls `POST /api/v1/auth/logout`, which runs `revokeSession(sid, 'user_logout')` and answers `end_session_url`. The browser follows it; the logout page auto-submits the confirm form (nonce'd script); `end_session.success` revokes again (idempotent).
- `revokeSession` marks `Session.revoked_at` and the reason and emits `session.revoked` in a transaction, then deletes the provider session, its grants and their codes and tokens (`destroyProviderSession`, after commit, because `oidc_*` collections are written outside Mongoose sessions).
- Other callers: admin force logout, member lifecycle changes, admin MFA reset, password reset (`revokeIdentitySessions`), account-page password change and session revoke, organisation suspend or close (operator), failed re-check at token issuance.
- `requireAuth` calls `findLiveSession(sid)` on every Admin API request, so a revoked session stops working at once even with an unexpired access token.
- Standalone portals (WS-C C-5): `destroyProviderSession`, the end-session handler and a refresh denial queue a back-channel logout (`lib/backchannelLogout.ts`): a logout token signed with the tenant key (`typ: logout+jwt`, `sub`, `sid` = the Karbexa session id, `jti`, 2 min) sent to each standalone client's back-channel URI through the SSRF guard, one `Job` per client. Access changes call `queueLogoutsForLostAccess` after commit (from `emitAppAccessChanged`, so assignment removal, entitlement suspension or restriction, override removal and plan changes are all covered): for every standalone portal a recomputed member no longer holds, each live Karbexa session whose provider session has an authorization for that client gets a logout token (`reason: access_removed`, deduplicated per sid and client for 10 minutes). `queueProductBackchannelLogouts` (one product, some members, no holder check) remains for explicit callers.

## Standalone portals (WS-C)

- Clients: `karbexa-<key>` are not in the static client list; `providers.ts` `Adapter.find` for the `Client` model asks `findStandaloneClientMetadata` (`lib/standalonePortals.ts`), which builds the metadata from the `App` registry. No cache of ours: a change applies on the next request (oidc-provider caches built clients by metadata hash).
- Gate: interaction policy prompt `product_access` on every authorization request (SSO included), plus `evaluateGate` in the token and userinfo paths; denials render `identity/html.ts` `deniedPage` and call `logProductAccessDenied`.
- Claims: `buildStandaloneClaims` through the wrapped `findAccount` (ID token, userinfo) and `extraTokenClaims` (access token). Decision S-12.

## How the three APIs verify tokens

| API | Middleware | Checks |
|---|---|---|
| Tenant `/api/v1` | `requireAuth` | issuer `${ID_ISSUER_ORIGIN}/realms/tenant`, audience `urn:karbexa:admin`, RS256, `typ at+jwt`, `token_use: access`, member belongs to `org`, live `Session` |
| Operator `/operator/v1` | `requireOperator` | operator realm issuer and audience, `token_use: access`, account still active with an operator role, live `OperatorSession`, IP allow-list |
| Platform `/platform/v1` | `authenticateService` | services realm issuer, audience `urn:karbexa:platform-api`, `token_use: service`, token age at most 15 min, allowed client |

Products verify member tokens the same way with audience `urn:karbexa:products` (their own code, in the products repo).

## Events produced

| Event | Where | `data` |
|---|---|---|
| `session.revoked` | `revokeSessionsTx` in `identity/sessions.ts` (one per revoked tenant session) | `{ sid, member_id }` |

Login and MFA activity goes to `SecurityEvent`, not to platform events. Envelope and delivery: `../platform-api/API.md`.

## Patterns to copy

| For | Copy |
|---|---|
| A new hosted step | `server/src/identity/interactions.ts` (check uid against the cookie, `authLimiter`, uniform errors) |
| A page shell | `shellForClient` in `server/src/identity/html.ts` |
| A revocation | `revokeSessionsTx` in the transaction, `destroyProviderSession` after commit (`identity/sessions.ts`) |
| Pure decision logic with a unit test | `server/src/identity/federationLink.ts` and its test |
