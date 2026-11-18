# Identity: endpoints

Issuer origin is `ID_ISSUER_ORIGIN` (default `http://id.karbexa.localhost:5000`, https in production). Each realm issuer is `${ID_ISSUER_ORIGIN}/realms/<realm>`. Guards here are not product roles: OIDC endpoints are protocol endpoints; hosted pages are protected by the interaction cookie and `authLimiter`.

## Realms and clients

| Realm | Client id | Auth method | Grants | Redirect URIs | Post-logout URIs | Audience (resource) | Scopes |
|---|---|---|---|---|---|---|---|
| tenant | `karbexa-admin-spa` | none (public, PKCE required) | authorization_code, refresh_token | `${ADMIN_SPA_ORIGIN}/auth/callback` | `${ADMIN_SPA_ORIGIN}/login`, `${ADMIN_SPA_ORIGIN}/login?signed_out=1` | `urn:karbexa:admin` | `openid profile email` + resource scope `api` |
| tenant | `karbexa-products-spa` | none (PKCE) | authorization_code, refresh_token | `${PRODUCTS_SPA_ORIGIN}/auth/callback` | `${PRODUCTS_SPA_ORIGIN}/login`, `.../login?signed_out=1` | `urn:karbexa:products` | same |
| operator | `karbexa-operator-spa` | none (PKCE) | authorization_code, refresh_token | `${OPERATOR_SPA_ORIGIN}/operator/callback` | `${OPERATOR_SPA_ORIGIN}/operator` | `urn:karbexa:operator` | same |
| services | `karbexa-products-backend` | `private_key_jwt` (RS256), JWKS from `SERVICES_PRODUCTS_BACKEND_JWKS` | client_credentials | none | none | `urn:karbexa:platform-api` | `platform.org.read platform.members.read platform.access.read platform.sessions.read platform.events.read platform.role_catalog.write` |
| services | `karbexa-admin-backend` | `private_key_jwt`, JWKS from `SERVICES_ADMIN_BACKEND_JWKS` | client_credentials | none | none | `urn:karbexa:products-internal` | `products.internal.read` |

- Outside production each SPA client also accepts the `http://localhost:<port>` and `http://127.0.0.1:<port>` variants of its origin (`devOrigins` in `server/src/identity/providers.ts`).
- A services client is registered only when its JWKS env var is set.
- A client may obtain exactly one audience; any other `resource` gives `invalid_target` (`getResourceServerInfo`).
- No consent screen (`loadExistingGrant`). CORS on provider endpoints is client-based: the origin must match a redirect URI origin of a public client.
- Standalone portals (WS-C C-2): clients `karbexa-<key>` in the tenant realm, audience `urn:karbexa:<key>`, first-party (no consent). They are answered from the App registry by the provider adapter (`providers.ts` `Adapter.find` for `Client` → `lib/standalonePortals.ts` `findStandaloneClientMetadata`), so a registration or rotation takes effect on the next request. The previous secret of a rotation is accepted for 24 h.

## OIDC endpoints (under `/realms/<realm>`)

Routes come from `ROUTES` in `server/src/identity/providers.ts`.

| Path | tenant | operator | services |
|---|---|---|---|
| `/.well-known/openid-configuration` | yes | yes | yes |
| `/oauth/authorize` | yes | yes | no (no response types) |
| `/oauth/token` | yes | yes | yes (client_credentials) |
| `/oauth/jwks` | yes | yes | yes |
| `/oauth/revoke` | yes | yes | yes |
| `/oauth/end_session` | yes | yes | no |
| `/oauth/userinfo` | yes | yes | disabled |

Disabled everywhere: dev interactions, device flow, introspection.

## Hosted pages and form endpoints

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/realms/tenant/interaction/:uid` | `identity/interactions.ts` | Renders the current step: login, TOTP or enrolment (QR and setup key). Consent is auto-granted |
| POST | `/realms/tenant/interaction/:uid/login` | `identity/interactions.ts` | e-mail and password; `authLimiter` |
| POST | `/realms/tenant/interaction/:uid/totp` | `identity/interactions.ts` | 6-digit TOTP or a recovery code; `authLimiter` |
| POST | `/realms/tenant/interaction/:uid/enrol` | `identity/interactions.ts` | First-sign-in TOTP enrolment; `authLimiter` |
| GET | `/realms/tenant/interaction/:uid/abort` | `identity/interactions.ts` | Ends with `access_denied` |
| GET | `/realms/tenant/interaction/:uid/entra` | `identity/interactions.ts` | Starts Microsoft sign-in (only when `ENTRA_CLIENT_ID` and `ENTRA_CLIENT_SECRET` are set) |
| GET | `/realms/tenant/federation/entra/callback` | `identity/interactions.ts` | Entra redirect URI; bounces to `.../interaction/<uid>/entra/return` |
| GET | `/realms/tenant/interaction/:uid/entra/return` | `identity/interactions.ts` | Code exchange, id_token validation, account resolution |
| GET | `/realms/tenant/account` | `identity/account.ts` | Account page (live tenant session cookie or Admin Bearer token; else redirect to `${ADMIN_SPA_ORIGIN}/login`) |
| POST | `/realms/tenant/account/password` | `identity/account.ts` | Change password (refused for identities with federated links); revokes all other sessions |
| POST | `/realms/tenant/account/totp/initiate`, `/totp/confirm` | `identity/account.ts` | (Re-)enrol TOTP; pending secret in the encrypted cookie `tenant_account_totp_pending` (10 min) |
| POST | `/realms/tenant/account/recovery-codes` | `identity/account.ts` | Generate 10 new recovery codes (replaces the old set) |
| POST | `/realms/tenant/account/sessions/revoke`, `/sessions/revoke-others` | `identity/account.ts` | Revoke one or all other sessions of the identity |
| GET | `/realms/operator/interaction/:uid` | `operator/interactions.ts` | Login, MFA or enrolment (setup key and `otpauth://` link, no QR) |
| POST | `/realms/operator/interaction/:uid/login` | `operator/interactions.ts` | `authLimiter` |
| POST | `/realms/operator/interaction/:uid/mfa` | `operator/interactions.ts` | Verifies TOTP; on enrolment stores the secret; `authLimiter` |
| GET | `/realms/operator/interaction/:uid/abort` | `operator/interactions.ts` | |

Every account-page POST requires a CSRF token: HMAC-SHA256 of `sid:timestamp` with the first cookie key, max age 2 h (`createCsrfToken` and `verifyCsrfToken` in `identity/account.ts`). The whole `/realms/operator` realm sits behind the operator IP allow-list (`requireOperatorIp`).

## Tenant-API endpoints that belong to the sign-in flow

Documented with the rest of the tenant API in `../admin-center/API.md` (section "Health, auth, me, stream tickets" and the people routes):

`POST /api/v1/auth/logout`, `POST /api/v1/auth/setup-password`, `POST /api/v1/auth/request-password-reset`, `POST /api/v1/auth/reset-password`, `GET /api/v1/auth/me`, `POST /api/v1/people/verify-invite`, `POST /api/v1/people/renew-invite`, `POST /api/v1/people/:id/mfa-reset`.

Operator invitation endpoints (`/operator/v1/invite/verify`, `/invite/accept`): `../command-center/API.md`.

## Token claims

| Realm | Standard | Extra claims (`extraTokenClaims` in `providers.ts`) |
|---|---|---|
| tenant | `iss`, `sub` (= `User._id`, the membership), `aud` (`urn:karbexa:admin` or `urn:karbexa:products`), `exp`, `iat`, `jti`, `client_id`, `scope`; header `typ: at+jwt`, RS256 | `idn` (Identity id), `org` (company id), `sid`, `org_roles` (names of all org roles), `apps: []` (always empty), `authz_ver`, `amr`, `token_use: 'access'`, `email` |
| operator | `sub` = `OperatorAccount._id`, `aud` `urn:karbexa:operator` | `email`, `roles`, `sid`, `token_use: 'access'`, `amr` |
| services | `client_id`, `scope`, `aud` | `token_use: 'service'` |

ID token claims: `sub`, `email`, `email_verified`, `name` (`conformIdTokenClaims: true`). Standalone portal clients get exactly `sub`, `org`, `org_slug`, `org_name`, `email`, `email_verified`, `name`, `picture`, `product_role` (this product only), `member_type` (`workforce` for everyone today), `sid` (the Karbexa session id), `authz_ver` on the ID token, the access token for `urn:karbexa:<key>` and userinfo (`buildStandaloneClaims`; decision S-12; meta `contracts/standalone-claims.md`). Access gate (WS-C C-3): an interaction policy prompt `product_access` on every authorization request and a check on every code exchange and refresh; a denial shows a hosted page ("{Product} is not available for your organisation" or "You don't have access to {Product}. Ask your administrator."), records a `product_access_denied` security event and issues no code; the page's Cancel ends with `error=access_denied` on the portal's redirect URI. Back-channel logout (WS-C C-5): a signed logout token (`typ: logout+jwt`, `sub`, `sid`, `jti`, 2 min) per standalone client with a session, queued as a `Job` on sign-out, session revocation, suspension, termination, tenant suspension and refresh denial.

## Errors

Tenant API failures use `{ success: false, error, code }` (`../admin-center/API.md`). Protocol endpoints answer with OIDC errors (`invalid_target`, `access_denied`, `invalid_grant`). Hosted pages show a generic message and never reveal whether an e-mail exists.
