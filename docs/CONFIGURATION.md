# Configuration

Every environment variable read by the Admin server (`process.env` in `server/src`) and client (`import.meta.env` in `client/src`), taken from the code on branch `chore/wrapup`. Defaults are the literal fallbacks in the code. "Required" means the code fails (throws, exits, or refuses requests) without it in that environment.

- Server: `server/src/index.ts` calls `dotenv.config()`, so `server/.env` is loaded at start. Template: `server/.env.example`.
- Client: Vite exposes `VITE_*` variables at build time. Template: `client/.env.example`.
- Variables marked **missing from `.env.example`** are read by the code but not listed in the template.

Related: [ARCHITECTURE.md](ARCHITECTURE.md), [portals/identity.md](portals/identity.md), [portals/platform-api.md](portals/platform-api.md).

---

## 1. Server: runtime and database

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `PORT` | no | `5000` | HTTP port | `5000` | | `server/src/index.ts:13` |
| `NODE_ENV` | no (but see notes) | none (unset = treated as non-production) | `production` switches on: https issuer check, required keys, fail-closed operator IP list, refusal of standalone Mongo, strict `TRUST_PROXY`, generic 500 messages, ignores `MOCK_EMAIL` / `EXPOSE_INVITE_TOKEN`, https-only subscriber URLs. `development` is needed for `ALLOW_ANY_ORIGIN` and selects the higher rate-limit defaults | `development` | Must be `production` | many, e.g. `identity/config.ts:52`, `operator/middleware.ts:34`, `lib/platformEvents.ts:36` |
| `MONGODB_URI` | **yes** | none (`process.env.MONGODB_URI!`) | Mongo connection string | a local replica set, e.g. a single-node `rs0` | Must be a replica set (transactions) | `server/src/config/db.ts:5`, `lib/seedRunner.ts:32`, scripts |
| `DB_NAME` | no | `admin_center` | Database name | `admin_center` | | `config/db.ts:6`, scripts |
| `ALLOW_STANDALONE_MONGO` | no | unset = false | `true` lets `runInTransaction` run **without** transactions on a standalone mongod (warning logged once) | `false` (use a replica set) | Ignored: standalone topology always throws in production | `server/src/lib/platformEvents.ts:39` |
| `TRUST_PROXY` | **yes in production** | dev: `1` | Express `trust proxy`: hop count, comma list of proxy IPs/CIDRs (or `loopback`/`linklocal`/`uniquelocal`), or `false`/`0`. `true` allowed only outside production | `1` | Startup fails if unset or `true` in production. Also read by `applyProxy` in `identity/providers.ts:82` (default `'1'`; sets `maxIpsCount` only for a number) | `server/src/lib/trustProxy.ts`, `identity/providers.ts:82` |
| `ENCRYPTION_KEY` | **yes** when used | none (throws "ENCRYPTION_KEY environment variable is not set") | AES-256-GCM key material (SHA-256 of the value) for TOTP secrets, Entra and account-page cookies, integration credentials. Account-page CSRF fallback | 32+ random bytes | Rotating it makes every stored TOTP secret undecryptable | `server/src/lib/cryptoService.ts:14`, `identity/account.ts:66` |
| `RBAC_CACHE_TTL_MS` | no | `30000` | TTL of the per-user role / group / permission cache | empty | Lower means faster role-change pickup, more DB reads | `server/src/lib/rbacCache.ts:47` |
| `STREAM_RECHECK_MS` | no | `30000` (`RECHECK_MS`) | How often the audit SSE stream re-checks the session | empty | **missing from `.env.example`** | `server/src/controllers/auditLogs.controller.ts:122` |

## 2. Server: HTTP, CORS, rate limits, links

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `CLIENT_URL` | yes for e-mail links | CORS: `http://localhost:5173`; links: none (`undefined` is inserted) | Comma list of allowed CORS origins for `/api/v1`, `/operator/v1`, `/platform/v1`; also the base of invite links (`${CLIENT_URL}/onboarding?...`) | `http://admin.karbexa.localhost:5173` | Invite links use the whole value, so keep it a single origin if it is used for links | `server/src/app.ts:41`, `lib/invitations.ts` (`inviteLink`), `scripts/send-claim-emails.ts:76` |
| `ADMIN_SPA_ORIGIN` | no | identity: `http://admin.karbexa.localhost:5173`; CORS: none | Admin SPA origin: OIDC redirect / post-logout URIs, CSP `form-action`, links on hosted pages, password-reset link; also appended to the CORS allow-list | `http://admin.karbexa.localhost:5173` | The CORS list only includes it when the variable is actually set (`app.ts:42` has no default) | `identity/config.ts:63`, `app.ts:42`, `controllers/auth.controller.ts:468` |
| `ALLOW_ANY_ORIGIN` | no | unset = false | Reflect any CORS origin | `false` | Honoured only when `NODE_ENV === 'development'` | `server/src/app.ts:36` |
| `GLOBAL_RATE_LIMIT` | no | dev `10000`, else `6000` per IP per 15 min | Global limiter (skips `OPTIONS` and `/platform/v1`) | empty | | `server/src/middleware/rateLimiter.ts:6` |
| `AUTH_RATE_LIMIT` | no | dev `100`, else `20` per IP per 15 min | Limiter on password, TOTP, enrol, account-page and password-reset endpoints | empty | | `middleware/rateLimiter.ts:20` |
| `APP_URL` | no | `http://localhost:5173` | Base URL used in policy notification links | `http://admin.karbexa.localhost:5173` | **missing from `.env.example`** | `server/src/controllers/policies.controller.ts:578` |

Note: `requestPasswordReset` builds its link from `ADMIN_SPA_ORIGIN || CLIENT_URL` (`resolveSpaOrigin` in `auth.controller.ts`); if neither is set it throws (Plan 0.7d, built, tests not yet run). There is no localhost fallback.

## 3. Server: identity service

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `ID_ISSUER_ORIGIN` | no (yes in practice for production) | `http://id.karbexa.localhost:5000` | Origin of all three realm issuers (`/realms/tenant`, `/realms/services`, `/realms/operator`); cookies are `secure` when https | `http://id.karbexa.localhost:5000` | Must start with `https://` in production (startup throws) | `server/src/identity/config.ts:53` |
| `OPERATOR_SPA_ORIGIN` | no | `http://admin.karbexa.localhost:5173` | Operator client redirect (`/operator/callback`) and post-logout (`/operator`) URIs | same as admin | | `identity/config.ts:62` |
| `PRODUCTS_SPA_ORIGIN` | no | `http://app.karbexa.localhost:5174` | Products SPA client redirect / post-logout URIs, CSP `form-action` | `http://app.karbexa.localhost:5174` | | `identity/config.ts:64` |
| `OIDC_COOKIE_KEYS` | **yes in production** | dev: generated into `server/.local/cookie-keys.json` | Comma list, newest first; per-realm cookie keys are derived from it. First key also signs account-page CSRF tokens | empty | Startup throws if empty in production | `server/src/identity/keys.ts:84` |
| `IDENTITY_TENANT_KEY` | **yes in production** | dev: `server/.local/keys/tenant.json` | Tenant realm RS256 signing key: PKCS#8 PEM (`\n` escapes allowed), private RSA JWK, or JWKS `{"keys":[...]}` | empty | | `identity/keys.ts:57` (`KEY_ENV`) |
| `IDENTITY_SERVICES_KEY` | **yes in production** | dev: `server/.local/keys/services.json` | Services realm signing key, same formats | empty | | `identity/keys.ts:57` |
| `IDENTITY_OPERATOR_KEY` | **yes in production** | dev: `server/.local/keys/operator.json` | Operator realm signing key, same formats | empty | | `identity/keys.ts:57` |
| `ENTRA_CLIENT_ID` | no | unset = Entra disabled | Platform multi-tenant Entra app id; shows "Sign in with Microsoft" when set together with the secret | empty | Register redirect URI `${ID_ISSUER_ORIGIN}/realms/tenant/federation/entra/callback` | `identity/config.ts:68` |
| `ENTRA_CLIENT_SECRET` | with `ENTRA_CLIENT_ID` | unset | Entra client secret | empty | | `identity/config.ts:69` |
| `SERVICES_PRODUCTS_BACKEND_JWKS` | no | unset = client not registered | Public JWKS (inline JSON, single JWK, or a file path) of `karbexa-products-backend` (`private_key_jwt`) | from the products backend | Required for the products backend to call `/platform/v1` | `identity/providers.ts:256` (`readServicesClientJwks`) |
| `SERVICES_ADMIN_BACKEND_JWKS` | no | unset = client not registered | Public JWKS of `karbexa-admin-backend` | printed by `npm run gen:admin-backend-key` | Required for the open-items proxy | `identity/providers.ts:256` |
| `ADMIN_BACKEND_CLIENT_KEY` | for open items | none (throws "ADMIN_BACKEND_CLIENT_KEY is not set") | Private PKCS#8 PEM (inline or a file path) used to sign the admin backend's client assertion | `server/.local/keys/admin-backend.pem` | Without it `GET /api/v1/people/:id/product-open-items` returns 503 | `server/src/platform/productsInternalToken.ts:28` |

## 4. Server: operator console

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `OPERATOR_IP_ALLOWLIST` | **yes in production** (else every operator request is 403) | empty = allow all outside production | Comma list of IPs/CIDRs allowed to reach `/operator/v1` and `/realms/operator`; read per request | empty | Set to the staff egress IPs/CIDRs. Depends on a correct `TRUST_PROXY` | `server/src/operator/middleware.ts:33` |
| `EXPOSE_INVITE_TOKEN` | no | unset = false | Include the raw invite token in `POST /operator/v1/orgs` responses | `false` (or `true` for local testing) | Ignored in production | `server/src/operator/routes.ts:274` |

## 5. Server: platform API and events

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `PLATFORM_CLIENT_PRODUCTS` | no | `karbexa-products-backend` → `people, projects, sign, desk`; other clients → none | JSON `{"<clientId>":["people",...]}`: products each services client may write role catalogs for; also makes a client id "registered" for `/platform/v1` | empty | Invalid JSON logs an error and falls back to the default. **missing from `.env.example`** | `server/src/identity/config.ts:81` |
| `PLATFORM_RATE_LIMIT_PER_MIN` | no | `1200` | Requests per minute per service client on `/platform/v1`; read per request | empty | Counted in MongoDB, shared across instances. **missing from `.env.example`** | `server/src/platform/rateLimit.ts:11` |
| `PLATFORM_SUBSCRIPTIONS` | no | unset = no subscriptions seeded | JSON array `[{"name","url","secret_env"}]` upserted into `PlatformEventSubscription` at dispatcher start. The entry named `karbexa-products-backend` also gives the products base URL for open items | e.g. `[{"name":"karbexa-products-backend","url":"http://localhost:5001/...","secret_env":"PLATFORM_SUB_SECRET_PRODUCTS"}]` | URL must be https and resolve to a public address in production. **missing from `.env.example`** | `server/src/lib/platformDispatcher.ts:42`, `platform/openItems.ts:9` |
| `PLATFORM_SUB_SECRET_<NAME>` | for each subscription | none (nudge fails with "Secret env var ... is not set") | HMAC secret for nudges; the name is whatever `secret_env` says and must match `^PLATFORM_SUB_SECRET_[A-Z0-9_]+$` | random string shared with the subscriber | **missing from `.env.example`** | `lib/platformDispatcher.ts:60` |
| `PLATFORM_DISPATCHER` | no | on | `off` disables the nudge dispatcher | | **missing from `.env.example`** | `lib/platformDispatcher.ts:152` |
| `PLATFORM_DISPATCH_INTERVAL_MS` | no | `2000` | Dispatcher tick interval | | **missing from `.env.example`** | `lib/platformDispatcher.ts:153` |
| `PRODUCTS_INTERNAL_URL` | no | falls back to `PLATFORM_SUBSCRIPTIONS` / DB subscription origin | Base URL of the products backend for `GET {base}/api/v1/internal/members/:id/open-items` | `http://localhost:<products port>` | **missing from `.env.example`** | `server/src/platform/openItems.ts:6` |
| `PEOPLE_LAUNCH_URL`, `PROJECTS_LAUNCH_URL`, `SIGN_LAUNCH_URL`, `DESK_LAUNCH_URL` | no | `http://<product_key>.karbexa.localhost:5174` | `App.launch_url` of the system product apps, written whenever `seedProductRegistry()` runs (`npm run seed:products`, and from operator provisioning when a product app is missing) | defaults | Set before seeding in production; existing apps are overwritten on the next seed run. **missing from `.env.example`** | `server/src/lib/productCatalog.ts:71` (`process.env[def.env]`) |

## 6. Server: e-mail

Order of transports (`server/src/lib/emailService.ts`): Azure Communication Services when both `AZURE_COMMUNICATION_CONNECTION_STRING` and `SENDER_EMAIL_ADDRESS` are set; otherwise (or on Azure failure) nodemailer: `MOCK_EMAIL` JSON transport → SMTP if `SMTP_HOST` → an ethereal.email test account (network call, preview URL logged).

| Name | Required | Default (code) | Purpose | Dev value | Production notes | Read in |
|---|---|---|---|---|---|---|
| `AZURE_COMMUNICATION_CONNECTION_STRING` | no | unset | Azure Communication Services e-mail client (created at module load) | empty | | `lib/emailService.ts:28` |
| `SENDER_EMAIL_ADDRESS` | with Azure | unset | Azure sender; also a `from` fallback | empty | | `lib/emailService.ts:110` |
| `EMAIL_FROM` | no | `SMTP_FROM_EMAIL` → `SENDER_EMAIL_ADDRESS` → `noreply@admin-center.com` | From address for nodemailer | empty | | `lib/emailService.ts:139`, `lib/notificationEngine.ts:96` |
| `SMTP_HOST` | no | unset = ethereal fallback | SMTP server | empty | Set in production unless Azure is used. **missing from `.env.example`** | `lib/emailService.ts:55`, `lib/notificationEngine.ts:103` |
| `SMTP_PORT` | no | `587` | | | **missing from `.env.example`** | `lib/emailService.ts:58` |
| `SMTP_SECURE` | no | false | `true` for implicit TLS | | **missing from `.env.example`** | `lib/emailService.ts:59` |
| `SMTP_USER`, `SMTP_PASS` | with SMTP | unset | SMTP auth | | **missing from `.env.example`** | `lib/emailService.ts:61-62` |
| `SMTP_FROM_EMAIL` | no | unset | Second-choice from address | | **missing from `.env.example`** | `lib/emailService.ts:139`, `lib/notificationEngine.ts:96` |
| `MOCK_EMAIL` | no | unset = false | `true` keeps all mail in-process (nodemailer JSON transport) | `true` for local test harnesses | Ignored in production. **missing from `.env.example`** | `lib/emailService.ts:50` |

`SENDGRID_API_KEY` is listed in `server/.env.example` but **no code reads it**.

## 7. Server: scripts only

These are read only by `server/src/scripts/*`, never by the running server.

| Name | Script | Default (code) | Purpose / notes |
|---|---|---|---|
| `OPERATOR_SEED_EMAIL`, `OPERATOR_SEED_PASSWORD` | `seed-operator.ts` (`npm run seed:operator`) | none (both required; password ≥ 12 chars) | Create or reset an operator account |
| `OPERATOR_SEED_NAME` | `seed-operator.ts` | `Platform Operator` | |
| `OPERATOR_SEED_FORCE` | `seed-operator.ts` | unset | `true` allows running in production. Mentioned only inside a comment in `.env.example`, not as its own line |
| `SEED_ADMIN_EMAIL` | `seed-first-user.ts` (`npm run seed:first`) | `admin@karbexa.local` | |
| `SEED_ADMIN_PASSWORD` | `seed-first-user.ts` | **`PlatformAdmin2026!`** (hard-coded) | Set it explicitly; the fallback is a known password |
| `SEED_ADMIN_NAME` | `seed-first-user.ts` | `Platform Administrator` | |
| `ADMIN_MONGODB_URI` | `seed-e11.ts` | → `MONGODB_URI` → `mongodb://localhost:27017/admin_center` | E11 migration (not used for go-live). **missing from `.env.example`** |
| `MONOLITH_MONGODB_URI`, `MONOLITH_URI` | `seed-e11.ts` | `mongodb://localhost:27017/karbexa` | Source DB of the E11 migration. **missing from `.env.example`** |
| `MONGODB_URI` | `migrate-ip-restrictions.ts`, `test-misconfiguration-detection.ts` | `mongodb://localhost:27017/sowaye`, `mongodb://localhost:27017/admin_center` | These two scripts have their own defaults |

The smoke scripts (`smoke-oidc-login.ts`, `smoke-sprint2.ts`) and the `__tests__` files set their own values (in-memory Mongo, generated `ENCRYPTION_KEY` and `OIDC_COOKIE_KEYS`) and do not need a `.env`.

## 8. Client (`client/`, Vite)

| Name | Required | Default (code) | Purpose | Dev value (`client/.env.example`) | Production notes | Read in |
|---|---|---|---|---|---|---|
| `VITE_API_URL` | no | `http://${window.location.hostname}:5000/api/v1` | Tenant API base | `http://admin.karbexa.localhost:5000/api/v1` | Set at build time | `client/src/lib/apiClient.ts:9`, `client/src/lib/session.ts:6` |
| `VITE_OIDC_ISSUER` | no | `http://id.karbexa.localhost:5000/realms/tenant` | Tenant realm issuer for login / token / refresh | `http://id.karbexa.localhost:5000/realms/tenant` | Must equal `${ID_ISSUER_ORIGIN}/realms/tenant` | `client/src/lib/oidc.ts:5` |
| `VITE_OIDC_CLIENT_ID` | no | `karbexa-admin-spa` | OIDC client id | `karbexa-admin-spa` | | `client/src/lib/oidc.ts:7` |
| `VITE_ID_ISSUER_ORIGIN` | no | `http://id.karbexa.localhost:5000` | Operator authority = `${VITE_ID_ISSUER_ORIGIN}/realms/operator` | `http://id.karbexa.localhost:5000` | Must equal `ID_ISSUER_ORIGIN` | `client/src/features/operator/operatorAuth.ts:5` |
| `VITE_OPERATOR_API_URL` | no | `http://${window.location.hostname}:5000/operator/v1` | Operator API base | `http://admin.karbexa.localhost:5000/operator/v1` | | `client/src/features/operator/operatorApi.ts:9` |
| `PROD` (Vite built-in) | n/a | set by Vite | Hides the dev invite-token display on the operator orgs page in production builds | | | `client/src/pages/operator/OperatorOrgsPage.tsx:55` |

The resource indicators (`urn:karbexa:admin`, `urn:karbexa:operator`) and the operator client id `karbexa-operator-spa` are hard-coded in the client.

## 9. `.env.example` findings

**Read by the server but missing from `server/.env.example`:** `STREAM_RECHECK_MS`, `APP_URL`, `PLATFORM_CLIENT_PRODUCTS`, `PLATFORM_RATE_LIMIT_PER_MIN`, `PLATFORM_SUBSCRIPTIONS`, `PLATFORM_SUB_SECRET_*`, `PLATFORM_DISPATCHER`, `PLATFORM_DISPATCH_INTERVAL_MS`, `PRODUCTS_INTERNAL_URL`, `PEOPLE_LAUNCH_URL`, `PROJECTS_LAUNCH_URL`, `SIGN_LAUNCH_URL`, `DESK_LAUNCH_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `MOCK_EMAIL`, `OPERATOR_SEED_FORCE` (comment only), and the script-only `ADMIN_MONGODB_URI`, `MONOLITH_MONGODB_URI`, `MONOLITH_URI`.

**Listed but unused:** `SENDGRID_API_KEY`.

**Formatting:** `server/.env.example:38` is a continuation of the comment on line 37 that lost its `#` (the text "escapes allowed), a private RSA JWK, ..."). It contains no `=`, so it is not parsed as a variable, but it should be a comment.

`client/.env.example` lists all five `VITE_*` variables the client reads.

## 10. Minimum production set

From the checks in the code, a production server will not start or will refuse traffic without: `NODE_ENV=production`, `MONGODB_URI` (replica set), `TRUST_PROXY` (not `true`), `ID_ISSUER_ORIGIN` (https), `OIDC_COOKIE_KEYS`, `IDENTITY_TENANT_KEY`, `IDENTITY_SERVICES_KEY`, `IDENTITY_OPERATOR_KEY`, `ENCRYPTION_KEY` (first TOTP enrolment / login), `OPERATOR_IP_ALLOWLIST` (operator access). For a working platform: `ADMIN_SPA_ORIGIN`, `OPERATOR_SPA_ORIGIN`, `PRODUCTS_SPA_ORIGIN`, `CLIENT_URL`, `SERVICES_PRODUCTS_BACKEND_JWKS`, `SERVICES_ADMIN_BACKEND_JWKS` + `ADMIN_BACKEND_CLIENT_KEY`, `PLATFORM_SUBSCRIPTIONS` + its `PLATFORM_SUB_SECRET_*`, and an e-mail transport (Azure or SMTP). Never set `MOCK_EMAIL` or `EXPOSE_INVITE_TOKEN` in production (both are ignored there anyway).
