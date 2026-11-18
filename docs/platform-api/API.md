# Platform API: endpoints and events

Everything the products backend (People, Projects, Sign, Desk, later Knowledge Base) and standalone portals use to read Admin data and follow changes. Machine-to-machine: callers are service clients of the `services` realm (`../identity/API.md`). The contract is `docs/architecture/05-API-CONTRACTS.md` and `06-PLATFORM-EVENT-CONTRACTS.md` in the meta repo (changed only additively, after a recorded decision); this file describes the code. Guard here means the OAuth scope the token must carry.

## Request pipeline (`server/src/platform/index.ts`)

1. Echo `X-Correlation-Id` when present.
2. `platformAuthFailureLimiter`: per IP, 300 **401 responses** per 15 min, then 429 `RATE_LIMITED`.
3. `authenticateService`: Bearer token verified locally against the services realm public keys (key set rebuilt every 5 min): issuer `${ID_ISSUER_ORIGIN}/realms/services`, audience `urn:karbexa:platform-api`, RS256, `typ: at+jwt`, `maxTokenAge: 15m`, `exp` and `iat` required, `token_use === 'service'`, and the `client_id` must be `karbexa-products-backend` or have products in `PLATFORM_CLIENT_PRODUCTS`. Sets `req.service = { client_id, scopes }`. Failures: 401 `NO_TOKEN` / `INVALID_TOKEN`.
4. `platformRateLimiter`: per `client_id`, `PLATFORM_RATE_LIMIT_PER_MIN` (default 1200) per minute, shared MongoDB store (`MongoRateLimitStore`), then 429 `RATE_LIMITED`.
5. Per-route `requireServiceToken(scope)`: 403 `INSUFFICIENT_SCOPE` if the scope is missing.

The global per-IP limiter in `app.ts` skips `/platform/v1`. Error shape: `{ error, code }` (no `success` field).

**Org scoping:** tokens are not bound to an org. Any authenticated client with the scope can read any org. Product scoping (`PLATFORM_CLIENT_PRODUCTS`) applies only to the role-catalog write.

## Endpoints

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
| PUT | `/apps/:productKey/manifest` | `platform.role_catalog.write` | `manifest.ts` | See 3.3a |
| GET | `/apps` | `platform.role_catalog.write` | `manifest.ts` | Registered products in the manifest view (below) |

Member view fields (`memberView` in `readApi.ts`): `id`, `email`, `full_name`, `department_id`, `location_id`, `job_title` (from `custom_fields.job_title`), `employment_type`, `manager_id`, `reports_to` (same as `manager_id`), `lifecycle_state`, `employee_id`, `hire_date`, `termination_date`, `phone`, `avatar_url`, `identity_id`, `authz_ver`, `updated_at`.

## Role catalog write

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

## Manifest publish
`PUT /platform/v1/apps/:productKey/manifest` is the role-catalog write plus product registration. Same scope, same `serviceMayAccessProduct` allow-list (`PRODUCT_NOT_ALLOWED`), same optimistic lock on `App.role_catalog_version` (the body's `version`), same `ROLE_IN_USE` rule, one transaction, same post-commit fan-out. Unlike the role-catalog route it **upserts** the `App`, so a new key registers a product; the key must match the path, match `^[a-z][a-z0-9_]{1,30}$` and not be `admin`.

Body: `{ manifest_version: 1, key, name, description (≤160), icon, category: core|work|it|talent, status: active|beta|hidden|retired, version (int ≥1), hosting: { mode: 'suite', launch_path }, roles: [{ key, name, description?, rank (int ≥1), is_default?, assignable? }], default_assignments?: [{ target: 'all_members', role }], capabilities?: { seats, offboarding } }`. Exactly one default role; `default_assignments[].role` must be one of the roles. `capabilities` is validated and not stored yet. Standalone hosting, role audience, `self_signup` and `external_users` are deferred (Zyntrus and Assets).

Writes `App.name, description, icon, product_category, product_status, manifest_version, launch_path, launch_url, default_role_key, default_assignments` and the `ProductRole` rows. `launch_url` is `<KEY>_LAUNCH_URL` from the environment when set, else the products web app origin plus `launch_path`. Stale `version` returns 200 with the stored manifest. No operator audit entry is written (an operator audit row needs an operator).

`GET /platform/v1/apps` returns every registered product in the same view plus `product_key` and `role_catalog_version`. The in-process registry cache is cleared on publish; other processes see a new product within 60 seconds.

## Outbound: Admin to the products backend (not part of `/platform/v1`)

- Token: `getProductsInternalToken()` (`productsInternalToken.ts`) posts `client_credentials` to `${ID_ISSUER_ORIGIN}/realms/services/oauth/token` as `karbexa-admin-backend` with a `private_key_jwt` assertion (iss/sub = client id, aud = services issuer, 120 s, `kid` = RFC 7638 thumbprint), `resource=urn:karbexa:products-internal`, `scope=products.internal.read`. Cached until 60 s before expiry; concurrent callers share one request. Key: `ADMIN_BACKEND_CLIENT_KEY`.
- Open items (`openItems.ts`): `GET ${base}/api/v1/internal/members/:memberId/open-items?org_id=` with a 5 s timeout. `base` = `PRODUCTS_INTERNAL_URL`, else the origin of the `PLATFORM_SUBSCRIPTIONS` entry named `karbexa-products-backend`, else the origin of the active `PlatformEventSubscription` with that name. Any failure → 503 `PRODUCTS_UNAVAILABLE`.

## Events

### Envelope

`{ id, type, version, occurred_at, org_id, seq, subject: { type, id }, actor: { type, id? }, correlation_id, data }`

### Types emitted anywhere in the code

| Type | Subject | Emitted by |
|---|---|---|
| `org.provisioned` | org | operator `POST /orgs` |
| `org.suspended`, `org.reactivated`, `org.closed` | org | operator status endpoints |
| `org.updated` | org | tenant company settings |
| `entitlement.changed` | org | operator provisioning, plan assignment, entitlement PUT |
| `member.provisioned` | member | tenant invite / bulk invite; operator provisioning (first admin) |
| `member.updated` | member | tenant `updateUser`, `bulkAssignLocation`, lifecycle moves between active, probation and on_leave |
| `member.suspended`, `member.reactivated`, `member.terminated` | member | tenant lifecycle transitions |
| `app_access.changed` | member | any change to a member's effective product access (tenant and operator paths, role catalog) |
| `session.revoked` | member | every tenant session revocation |
| `org_structure.changed` | department or location | tenant department / business unit / location writes |
| `calendar.changed` | org | tenant holiday and work schedule writes |
| `reporting_line.changed` | member | tenant reporting-line writes |

Payloads per emitter follow below; the emitting code is described in `../admin-center/ARCHITECTURE.md` and `../command-center/ARCHITECTURE.md`.

### Payloads by emitter

**Tenant API (members of the organisation as actor)**

All are written with `emitPlatformEvent` inside a `runInTransaction` together with the domain change and an `auditLogger.logTx` row (pattern in ARCHITECTURE.md). Actor is `{ type: 'member', id: <caller> }`.

| Event type | Emitted from | `data` |
|---|---|---|
| `member.provisioned` | `people.controller.inviteUser`, `bulkInviteUsers` | member admin fields, `lifecycle_state: 'invited'` |
| `member.updated` | `people.controller.updateUser` (`:1457`, only when tracked fields changed), `bulkAssignLocation`, `transitionLifecycleTx` for active ↔ probation ↔ on_leave (elevation 5.11, `changed.lifecycle_state`) | `{ changed }` |
| `member.suspended` / `member.reactivated` / `member.terminated` | `people.controller.transitionLifecycleTx`, used by `updateUserLifecycle`, `bulkUpdateLifecycle`, `deleteUser` | suspended: `lifecycle_state`, `reason`, `session_ids`; reactivated: `lifecycle_state`; terminated: `termination_date`. Mapping in `server/src/lib/lifecycle.ts` `lifecycleEventFor` |
| `app_access.changed` | `emitAppAccessChanged` / `emitAppAccessChangedBounded` from people (invite, update, lifecycle, bulk role/location), apps (`assignApp`, `revokeApp`), `appAccess.updateAssignment`, roles (`assignRoleToUser`, `unassignRoleFromUser`), groups (`updateGroup`, `deleteGroup`, `addUsersToGroup`, `removeUsersFromGroup`) | `{ authz_ver, products: { <product_key>: <role_key> } }`; bumps `User.authz_ver` first |
| `session.revoked` | `identity/sessions.revokeSessionsTx` via `security.controller.forceLogoutUser`, lifecycle transitions, MFA reset, password reset, logout | `{ sid, member_id }` |
| `org.updated` | every `company.controller` settings update (10 handlers) | the changed setting |
| `org_structure.changed` | `organization.controller` create/update/delete/move department, delete business unit; `locations.controller` create/update/delete | department or location fields |
| `calendar.changed` | `holidays.controller` calendar, holiday and assignment writes; `workSchedules.controller` schedule and assignment writes | `{ affected_location_ids }` |
| `reporting_line.changed` | `reportingLines.controller` (4 handlers) | `{ manager_id, secondary_manager_ids }` |

No platform events are emitted by: policies, workflows, data fields, integrations, notifications, IP restrictions, identity providers, security policies, teams (teams writes are transactional but emit no event).

**Operator API (operator as actor)**

| Event type | Emitted from | `data` |
|---|---|---|
| `org.provisioned` | `POST /orgs` | `{ slug, name, status }` |
| `entitlement.changed` | `POST /orgs` (one per plan product), `PATCH /orgs/:id` (one per plan product), `PUT /orgs/:id/entitlements/:productKey` | `{ product_key, status }` |
| `member.provisioned` | `POST /orgs` (first admin) | `{ email, full_name, lifecycle_state }` |
| `app_access.changed` | `POST /orgs` (first admin, in the transaction); status change, plan assignment and entitlement change (post-commit fan-out via `fanOutAppAccessChanged`, batches of 200) | `{ authz_ver, products }` |
| `org.suspended` / `org.reactivated` / `org.closed` | `POST /orgs/:id/{suspend,reactivate,close}` | `{ reason }` |
| `session.revoked` | suspend / close (one per revoked sid, via `revokeSessionsTx`) | `{ sid, member_id }` |

No events for plan create/update, operator account changes, or IdP tenant approval (comment at `routes.ts`: "06 has no IdP event type").

**Identity**

| Event type | Emitted from | `data` |
|---|---|---|
| `session.revoked` | `revokeSessionsTx` (`server/src/identity/sessions.ts`), through force logout, lifecycle transitions, MFA reset, password reset, logout, org suspend or close | `{ sid, member_id }` |

Delivery (nudges, retries, ordering, retention): `ARCHITECTURE.md`. Writing an event (outbox pattern): `ARCHITECTURE.md`.
