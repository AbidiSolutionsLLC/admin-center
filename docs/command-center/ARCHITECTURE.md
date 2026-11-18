# Command Center: architecture

Same SPA build as the Admin Center, under `/operator`, calling the Operator API. Separate token store, API client, realm, audience and key set: a tenant token is rejected by `/operator/v1`, an operator token by `/api/v1`. Repo-wide layout: `../ARCHITECTURE.md`; realm internals: `../identity/ARCHITECTURE.md`.

## Request flow

`browser (OperatorGuard, operatorApi)` -> `/operator/v1/*` -> global per-IP limiter -> correlation id -> `requireOperator` (IP allow-list, token, active account, live `OperatorSession`) -> sub-router (`server/src/operator/routes.ts` and the files it mounts) with `requirePermission('<perm>')` per route -> handler (zod validation, `asyncHandler`) -> models -> audit helper -> `errorHandler`.

Operator and platform APIs are cross-tenant by design: the organisation comes from the URL (`/orgs/:id`) and is validated as an ObjectId and checked for existence. Org-scoped sub-resources (identity-provider connection, notes, entitlement override) are looked up by `_id` and `company_id`.

Operator writes go through the operator audit helper: an `OperatorAuditEvent` and, when a company is involved, a mirrored tenant `AuditEvent` (`source: 'operator'`, `module: 'operator'`, `actor_email: 'operator:<email>'`), in the same transaction as the change where one exists.

## Client structure

| Layer | Files |
|---|---|
| Routes, guard, shell | `client/src/App.tsx`, `features/operator/OperatorGuard.tsx`, `components/layout/shells.tsx` (`OperatorShell`), `navigation.ts` (`OPERATOR_SHELL`) |
| Auth | `features/operator/operatorAuth.ts`: realm `karbexa-operator-spa`, resource `urn:karbexa:operator` (hard-coded), tokens in memory only, logout through `/realms/operator/oauth/end_session` with `id_token_hint` |
| Data | `features/operator/operatorApi.ts` (axios client, TanStack Query hooks, response types) |
| Templates | `DashboardPage` (Overview, Health, Security), `ListPage` (Organizations, Onboarding, Products, Plans, Audit), `ObjectPage` (tenant profile) |

Client configuration: `VITE_ID_ISSUER_ORIGIN` (authority `${VITE_ID_ISSUER_ORIGIN}/realms/operator`), `VITE_OPERATOR_API_URL` (default `http://<host>:5000/operator/v1`).

## Background work (started in `server/src/index.ts`)

| Job | Where | Period and guard |
|---|---|---|
| Signals (Attention required) | `server/src/lib/signals.ts` | every 5 min under the `signals` lease; each rule is one query; matches are upserted, non-matches get `resolved_at`; a rule that throws leaves its own items alone; `sync_lag` shows after 10 minutes (`confirmed`) |
| Tenant daily stats | `signals.ts` | every 6 h under the `tenant-daily-stats` lease; upserts today's row per tenant |
| Health checks | `server/src/lib/health/` | every 60 s under the `health-checks` lease: `admin_api` (route counters, 5 min), `database`, `identity` (signing keys per realm; optional `IDENTITY_KEY_ROTATE_BY`), `event_dispatcher`, `products_api` and `products_worker` (one probe of the products health route), `email`, `jobs`; each check has 5 s, a failure or timeout is `unknown`. Thresholds: `lib/health/evaluate.ts` |
| Generic jobs | `server/src/lib/jobs.ts` | atomic claim, handlers by type (`registerJobHandler`), retry after 1, 5, 30, 120 min (5 attempts), stale `running` rows reclaimed; first user: `plan.apply` |
| Override expiry | `server/src/lib/overrideJobs.ts` | expires operator overrides |
| Seat counting | `server/src/lib/seats.ts` | recomputed (coalesced to once a second per tenant) after each `app_access.changed` commit; never on page load |
| Interval helper | `server/src/lib/periodic.ts` | `every(name, ms, fn)`: interval job guarded by `platformLease` |

## How it plugs into the platform

- Provisioning, plan assignment, entitlement changes and status changes emit platform events (below); products follow them through the Platform API (`../platform-api/`).
- `GET /health/sync` proxies the products internal health route with the Admin service token (`server/src/platform/productsInternalToken.ts`), cached 30 s.
- E-mail goes through the `EmailDelivery` outbox (`lib/emailService.ts`, `emailSender.ts`); provisioning writes the welcome e-mail row inside its transaction.

## Events produced

Actor `{ type: 'operator', id: <operator id> }`, correlation id from the request. Envelope and full type catalogue: `../platform-api/API.md`.

| Event type | Emitted from | `data` |
|---|---|---|
| `org.provisioned` | `POST /orgs` | `{ slug, name, status }` |
| `entitlement.changed` | `POST /orgs` (one per plan product), `PATCH /orgs/:id` (one per plan product), `PUT /orgs/:id/entitlements/:productKey` | `{ product_key, status }` |
| `member.provisioned` | `POST /orgs` (first admin) | `{ email, full_name, lifecycle_state }` |
| `app_access.changed` | `POST /orgs` (first admin, in the transaction); status change, plan assignment and entitlement change (post-commit fan-out via `fanOutAppAccessChanged`, batches of 200) | `{ authz_ver, products }` |
| `org.suspended` / `org.reactivated` / `org.closed` | `POST /orgs/:id/{suspend,reactivate,close}` | `{ reason }` |
| `session.revoked` | suspend / close (one per revoked sid, via `revokeSessionsTx`) | `{ sid, member_id }` |

No events for plan create/update, operator account changes, or IdP tenant approval (comment at `routes.ts`: "06 has no IdP event type").

No events for plan create or update, operator account changes, or identity-provider tenant approval (the event contract has no type for them).

## Patterns to copy for new code

| Layer | Exemplary file |
|---|---|
| Operator route with a permission mark and audit | `server/src/operator/routes.ts` (`POST /orgs/:id/suspend`) |
| Pure rule with a unit test | `server/src/lib/signals.ts` and `server/src/lib/__tests__/signals.test.ts` |
| Background job | `server/src/lib/jobs.ts` (`registerJobHandler`) and the `plan.apply` handler in `server/src/operator/plans.ts` |
| Operator page on a template | `client/src/pages/operator/OperatorPlansPage.tsx` (`ListPage`), `OperatorOverviewPage.tsx` (`DashboardPage`) |
