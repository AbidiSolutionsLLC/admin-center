# Platform API (`/platform/v1`) and event feed

Reference for the machine-to-machine surface the products backend (People, Projects, Sign, Desk) uses to read Admin data and follow changes. Read from the code on branch `chore/wrapup`; paths are repo-relative. Spec background: `ecosystem-planning/phase-1-architecture/05` (API contracts) and `06` (events). Where they differ, the code is described.

Related: [identity.md](identity.md) (services realm, keys), [admin.md](admin.md) and [operator.md](operator.md) (which writes emit which events), [../ARCHITECTURE.md](../ARCHITECTURE.md).

---

## 1. Purpose and users

- **Callers:** service clients of the `services` realm. Today: `karbexa-products-backend` (audience `urn:karbexa:platform-api`). The second client, `karbexa-admin-backend`, is Admin calling **out** to the products backend (audience `urn:karbexa:products-internal`), see section 3.4.
- **What it provides:** read access to orgs, members, departments, locations, effective calendars, effective product access and session revocations; a per-org ordered event feed; write access to product role catalogs; signed "nudge" webhooks telling a subscriber that new events exist.
- **Model:** pull-based. Events are stored in an outbox (`PlatformEvent`) with a per-org sequence number. Subscribers are nudged, then pull `GET /orgs/:orgId/events?after_seq=`.

## 2. Where the code is

| File | Holds |
|---|---|
| `server/src/platform/index.ts` | `platformRouter`: correlation id echo, auth, rate limits, `GET /orgs/:orgId`, `GET /orgs/:orgId/members/:memberId/effective-access` |
| `server/src/platform/readApi.ts` | Orgs list, events, members, departments, locations, session revocations; mounts calendars and role catalog |
| `server/src/platform/calendars.ts` | `GET /orgs/:orgId/calendars/effective` |
| `server/src/platform/roleCatalog.ts` | `PUT /apps/:productKey/role-catalog` |
| `server/src/platform/requireServiceToken.ts` | `authenticateService`, `requireServiceToken(scope)`, `serviceMayAccessProduct` |
| `server/src/platform/rateLimit.ts` | Per-client limiter and auth-failure limiter |
| `server/src/platform/productsInternalToken.ts` | Admin's own client-credentials token for calling the products backend |
| `server/src/platform/openItems.ts` | Outbound open-items proxy (used by `GET /api/v1/people/:id/product-open-items`) |
| `server/src/platform/streamTickets.ts` | SSE stream tickets for the **tenant** API (`/api/v1/stream-tickets`, `/api/v1/audit-logs/stream`); lives here but is not part of `/platform/v1` |
| `server/src/lib/platformEvents.ts` | `runInTransaction`, `onCommit`, `emitPlatformEvent`, `emitAppAccessChanged`, `emitAppAccessChangedBounded`, `fanOutAppAccessChanged`, `correlationIdFor` |
| `server/src/lib/platformDispatcher.ts` | Nudge dispatcher, signature format, `verifyNudgeSignature` |
| `server/src/lib/platformLease.ts` | Mongo lease so only one instance dispatches |
| `server/src/lib/ssrfGuard.ts` | Subscriber URL validation and IP pinning |
| `server/src/lib/effectiveAccess.ts` | `computeEffectiveAccess` (rules in admin.md section 4.3) |

## 3. Pages and API endpoints

### 3.1 Request pipeline (`server/src/platform/index.ts`)

1. Echo `X-Correlation-Id` when present.
2. `platformAuthFailureLimiter`: per IP, 300 **401 responses** per 15 min, then 429 `RATE_LIMITED`.
3. `authenticateService`: Bearer token verified locally against the services realm public keys (key set rebuilt every 5 min): issuer `${ID_ISSUER_ORIGIN}/realms/services`, audience `urn:karbexa:platform-api`, RS256, `typ: at+jwt`, `maxTokenAge: 15m`, `exp` and `iat` required, `token_use === 'service'`, and the `client_id` must be `karbexa-products-backend` or have products in `PLATFORM_CLIENT_PRODUCTS`. Sets `req.service = { client_id, scopes }`. Failures: 401 `NO_TOKEN` / `INVALID_TOKEN`.
4. `platformRateLimiter`: per `client_id`, `PLATFORM_RATE_LIMIT_PER_MIN` (default 1200) per minute, shared MongoDB store (`MongoRateLimitStore`), then 429 `RATE_LIMITED`.
5. Per-route `requireServiceToken(scope)`: 403 `INSUFFICIENT_SCOPE` if the scope is missing.

The global per-IP limiter in `app.ts` skips `/platform/v1`. Error shape: `{ error, code }` (no `success` field).

**Org scoping:** tokens are not bound to an org. Any authenticated client with the scope can read any org. Product scoping (`PLATFORM_CLIENT_PRODUCTS`) applies only to the role-catalog write.

### 3.2 Endpoints

| Method | Path | Scope | Handler | Response / notes |
|---|---|---|---|---|
| GET | `/orgs` | `platform.org.read` | `readApi.ts` | `{ items: [{ id, slug, status, latest_seq }] }`, all orgs, no paging |
| GET | `/orgs/:orgId` | `platform.org.read` | `index.ts` | `{ id, slug, name, status, settings, branding, entitlements: [{ product_key, status }] }` |
| GET | `/orgs/:orgId/events` | `platform.events.read` | `readApi.ts` | Query `after_seq` (≥0, default 0), `limit` (1–500, default 100). `{ events: [...], latest_seq, has_more }`. 409 `CURSOR_AHEAD` if `after_seq > latest_seq`; 410 `CURSOR_EXPIRED` if the next event was purged. Records `SubscriptionCursor.last_acknowledged_seq` for the subscription whose `name` equals the caller's `client_id` |
| GET | `/orgs/:orgId/members` | `platform.members.read` | `readApi.ts` | Query `limit` (1–500, default 100), `cursor` (last member id), `updated_since` (ISO). `{ items: [member], next_cursor }` |
| GET | `/orgs/:orgId/members/:memberId` | `platform.members.read` | `readApi.ts` | One member view |
| GET | `/orgs/:orgId/members/:memberId/effective-access` | `platform.access.read` | `index.ts` | `{ member_id, authz_ver, products: { <key>: { role } } }`; `Cache-Control: no-store` |
| GET | `/orgs/:orgId/departments` | `platform.org.read` | `readApi.ts` | Query `updated_since`. Array of `{ id, name, type, parent_id, primary_manager_id, is_active }` |
| GET | `/orgs/:orgId/locations` | `platform.org.read` | `readApi.ts` | Query `updated_since`. Array of `{ id, name, parent_id, timezone }`, deleted excluded |
| GET | `/orgs/:orgId/calendars/effective` | `platform.org.read` | `calendars.ts` | Query `member_id` or `location_id` (one required), `from`, `to` (`YYYY-MM-DD`, ≤ 366 days). `{ holidays: [{ date, name, calendar_id, calendar_name, holiday_code, recurring_type }], work_schedule }`. Location resolution: explicit `location_id`, else the member's location, else `Company.settings.default_location_id`. Only assignments targeting that exact location are used |
| GET | `/sessions/revocations` | `platform.sessions.read` | `readApi.ts` | Query `since` (ISO), `limit` (1–1000, default 1000), `after_sid`, `realm` (`tenant`/`operator`). Array of `{ sid, member_id, org_id, revoked_at }`. More pages: headers `X-Has-More: true`, `X-Next-Since`, `X-Next-After-Sid` |
| PUT | `/apps/:productKey/role-catalog` | `platform.role_catalog.write` | `roleCatalog.ts` | See 3.3 |

Member view fields (`memberView` in `readApi.ts`): `id`, `email`, `full_name`, `department_id`, `location_id`, `job_title` (from `custom_fields.job_title`), `employment_type`, `manager_id`, `reports_to` (same as `manager_id`), `lifecycle_state`, `employee_id`, `hire_date`, `termination_date`, `phone`, `avatar_url`, `identity_id`, `authz_ver`, `updated_at`.

### 3.3 Role catalog write

`PUT /platform/v1/apps/:productKey/role-catalog`, body:

```json
{ "version": 2, "roles": [ { "key": "employee", "name": "Employee", "description": "...", "rank": 10, "is_default": true, "assignable": true } ] }
```

- `productKey` must be `people`, `projects`, `sign` or `desk` (404 otherwise, including `admin`).
- The caller must be allowed that product: `PLATFORM_CLIENT_PRODUCTS` JSON `{ "<clientId>": ["people", ...] }`; without it, `karbexa-products-backend` may write all four and any other client none (403 `PRODUCT_NOT_ALLOWED`).
- Validation: 1–100 roles, `key` matches `^[a-z][a-z0-9_]*$`, unique keys, exactly one `is_default`.
- `version` lower than the stored `role_catalog_version`: 200 with the stored catalog, nothing written. An optimistic lock inside the transaction handles concurrent writers the same way.
- Removing a role still used by an active `AppAssignment` (or removing the default while assignments without an explicit role exist): 409 `ROLE_IN_USE` with `roles`.
- If the default role changed or a kept role's rank or name changed, `app_access.changed` is fanned out (with `authz_ver` bump) for every org that has active assignments for the app, after the response is sent (actor `system`).

### 3.4 Outbound: Admin → products backend

- Token: `getProductsInternalToken()` (`productsInternalToken.ts`) posts `client_credentials` to `${ID_ISSUER_ORIGIN}/realms/services/oauth/token` as `karbexa-admin-backend` with a `private_key_jwt` assertion (iss/sub = client id, aud = services issuer, 120 s, `kid` = RFC 7638 thumbprint), `resource=urn:karbexa:products-internal`, `scope=products.internal.read`. Cached until 60 s before expiry; concurrent callers share one request. Key: `ADMIN_BACKEND_CLIENT_KEY`.
- Open items (`openItems.ts`): `GET ${base}/api/v1/internal/members/:memberId/open-items?org_id=` with a 5 s timeout. `base` = `PRODUCTS_INTERNAL_URL`, else the origin of the `PLATFORM_SUBSCRIPTIONS` entry named `karbexa-products-backend`, else the origin of the active `PlatformEventSubscription` with that name. Any failure → 503 `PRODUCTS_UNAVAILABLE`.

## 4. Roles and permissions

| Scope | Grants |
|---|---|
| `platform.org.read` | orgs list, org, departments, locations, effective calendars |
| `platform.members.read` | members list and single member |
| `platform.access.read` | effective access |
| `platform.sessions.read` | session revocations |
| `platform.events.read` | event feed |
| `platform.role_catalog.write` | role catalog PUT (plus product allow-list) |
| `products.internal.read` | issued to `karbexa-admin-backend` for the products backend's internal API (not checked by Admin) |

The services provider grants all `platform.*` scopes to `karbexa-products-backend` (`PLATFORM_API_SCOPES` in `server/src/identity/config.ts`).

## 5. Data models

| Model / collection | Key fields | File |
|---|---|---|
| `PlatformEvent` (`platformevents`) | `id` (`evt_<uuid>`), `type`, `version` (1), `occurred_at`, `org_id`, `seq`, `subject {type, id}`, `actor {type: member/operator/system, id}`, `correlation_id`, `data` | `server/src/models/PlatformEvent.model.ts`; unique (`org_id`, `seq`); **TTL 30 days** on `occurred_at` |
| `OrgEventCounter` | `_id` = org id, `seq` | `OrgEventCounter.model.ts` |
| `PlatformEventSubscription` | `name` (unique), `url`, `secret_ref` (env var name), `status` (`active`/`paused`) | `PlatformEventSubscription.model.ts` |
| `SubscriptionCursor` | `subscription_id`, `org_id`, `last_nudged_seq`, `last_acknowledged_seq`, `last_error`, `last_nudged_at`, `attempts`, `next_attempt_at` | `SubscriptionCursor.model.ts` |
| `PlatformLease` | `_id` = lease name, `holder`, `until` | `PlatformLease.model.ts` |
| `ProductRole`, `App` | catalog rows; `App.role_catalog_version`, `App.default_role_key` | admin.md |
| `Session` | revocation feed source | identity.md |

## 6. Platform events emitted

### 6.1 Envelope (as returned by `GET /orgs/:orgId/events`)

`{ id, type, version, occurred_at, org_id, seq, subject: { type, id }, actor: { type, id? }, correlation_id, data }`

### 6.2 Types emitted anywhere in the code

| Type | Subject | Emitted by |
|---|---|---|
| `org.provisioned` | org | operator `POST /orgs` |
| `org.suspended`, `org.reactivated`, `org.closed` | org | operator status endpoints |
| `org.updated` | org | tenant company settings |
| `entitlement.changed` | org | operator provisioning, plan assignment, entitlement PUT |
| `member.provisioned` | member | tenant invite / bulk invite; operator provisioning (first admin) |
| `member.updated` | member | tenant `updateUser`, `bulkAssignLocation` |
| `member.suspended`, `member.reactivated`, `member.terminated` | member | tenant lifecycle transitions |
| `app_access.changed` | member | any change to a member's effective product access (tenant and operator paths, role catalog) |
| `session.revoked` | member | every tenant session revocation |
| `org_structure.changed` | department or location | tenant department / business unit / location writes |
| `calendar.changed` | org | tenant holiday and work schedule writes |
| `reporting_line.changed` | member | tenant reporting-line writes |

Payloads per emitter are listed in admin.md section 6 and operator.md section 6.

### 6.3 Writing an event (outbox pattern)

`emitPlatformEvent(session, input)` increments `OrgEventCounter.seq` and inserts the `PlatformEvent` in the caller's transaction session, so the domain write, the audit row and the event commit or roll back together. See ARCHITECTURE.md for the full pattern.

### 6.4 Nudge dispatcher (`server/src/lib/platformDispatcher.ts`)

- Started in `server/src/index.ts` after `listen` (not in `createServer`). Disabled with `PLATFORM_DISPATCHER=off`. Interval `PLATFORM_DISPATCH_INTERVAL_MS` (default 2000 ms). Stops on SIGTERM / SIGINT and releases its lease.
- Subscriptions are upserted at start from `PLATFORM_SUBSCRIPTIONS`: JSON array `[{ "name", "url", "secret_env" }]`; `secret_env` must match `^PLATFORM_SUB_SECRET_[A-Z0-9_]+$` and names the env var holding the HMAC secret. Existing rows keep their `status`.
- Each cycle runs only on the instance holding the Mongo lease `platform-dispatcher` (TTL 30 s, renewed per nudge).
- For each active subscription and each org with `seq > 0`: nudge when `seq > last_nudged_seq`, or re-nudge every 60 s while `seq > last_acknowledged_seq`; skip while `next_attempt_at` is in the future. At most 4 nudges in flight.
- Nudge: `POST <url>` with body `{"org_id":"...","latest_seq":N}`, headers `Content-Type: application/json`, `X-Karbexa-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`, `X-Karbexa-Event-Id: <id of the latest event>`. 5 s timeout, no redirects, response body not read. 2xx = success.
- Failure: exponential backoff `min(1 h, 1000 ms × 2^attempts)`, error text stored on the cursor.
- URL safety (`ssrfGuard.ts`): https only (http allowed only for localhost outside production), no credentials in the URL, DNS resolved once, every address must be public unicast (private, loopback, link-local, metadata, NAT64, 6to4, Teredo, documentation and test ranges blocked), connection pinned to the validated address with the original Host / SNI.
- Receivers can verify with the exported `verifyNudgeSignature(secret, header, body, toleranceSec = 300)`.

## 7. Status

### Built ✓
- All endpoints in section 3.2 with scope checks, per-client rate limiting and auth-failure throttling.
- Transactional outbox with per-org sequence, 30-day retention, cursor-expiry and cursor-ahead errors.
- Signed nudges with backoff, re-nudge until acknowledged, single-instance lease, SSRF protection.
- Role catalog write with version lock, in-use protection and access fan-out.
- Outbound products-internal token and open-items proxy.

### Not built or partial ✗
- No org binding of service tokens; any registered client reads every org (section 3.1).
- `GET /orgs` returns every org in one response (no paging).
- Effective calendars use only assignments targeting the resolved location itself; parent locations are not walked (`calendars.ts`, query on `location_id: locId`).
- `/sessions/revocations?realm=operator` is always empty because the operator realm writes no `Session` rows.
- The per-client rate limiter uses an in-memory store (comment in `rateLimit.ts`: "move to a shared store before scaling out").

### Known issues
- The stream re-check `streamAllowed` treats an org as OK when `status === 'active' || is_active !== false` (`server/src/platform/streamTickets.ts:56`). An org with `status: 'suspended'` whose `is_active` is not `false` passes. Operator status changes set both fields, so this matters only for data written another way.
- Events older than 30 days are deleted by TTL; a subscriber that falls further behind gets 410 `CURSOR_EXPIRED` and must resync with the read endpoints.

## 8. Tests and how to run them

From `server/`:

| Command | Coverage |
|---|---|
| `npm run smoke:sprint2` | E4 platform read API, ack hook, dispatcher (signed nudges, backoff); E4a outbox atomicity and correlation ids; E4c per-client product scoping and `onCommit` hooks; E4d role-catalog lock and post-commit fan-out; L3-4 `karbexa-admin-backend` token; services token rate limit (`PLATFORM_RATE_LIMIT_PER_MIN=1`) |
| `npm test` | `lib/__tests__/platformDispatcher.test.ts`, `lib/__tests__/ssrfGuard.test.ts`, `platform/__tests__/rateLimit.test.ts`, `controllers/__tests__/openItemsProxy.test.ts`, `controllers/__tests__/streamTickets.test.ts`, `lib/__tests__/standaloneMongo.test.ts` |
