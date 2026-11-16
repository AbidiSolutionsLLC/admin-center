# Operator console (`/operator/*` + `/operator/v1` + operator realm)

Reference for the Karbexa staff console. Read from the code on branch `chore/wrapup`; paths are repo-relative. Spec background: `ecosystem-planning/phase-1-architecture/09` (operator realm). Where they differ, the code is described.

Related: [identity.md](identity.md) (realm internals, tokens), [admin.md](admin.md), [platform-api.md](platform-api.md).

---

## 1. Purpose and users

- **Users:** Karbexa staff with an `OperatorAccount` that is `status: 'active'` and holds at least one operator role (`platform_admin`, `operations`, `support`, `auditor`). They are not tenant members; operator accounts live in their own collection and their own OIDC realm.
- **What it does:** provision organisations from a plan (with a first Super Admin invite), suspend / reactivate / close organisations, assign a plan to an existing org, set per-product entitlements (status, seats), manage plans, manage operator accounts (create, suspend, reset password, reset MFA), approve an org's Entra tenant id, read the operator audit log.
- **Access path:** same SPA build as the tenant admin app, under `/operator`. Separate token store, separate API client, separate realm, separate audience. A tenant token is rejected by `/operator/v1` (different issuer, key set and audience).

## 2. Where the code is

| Area | Path |
|---|---|
| Client routes | `client/src/App.tsx` (operator block), `client/src/constants/routes.ts` (`OPERATOR_*`) |
| Guard and shell | `client/src/features/operator/OperatorGuard.tsx`, `client/src/components/layout/shells.tsx` (`OperatorShell`) |
| OIDC + token store (memory only) | `client/src/features/operator/operatorAuth.ts` |
| API client, hooks, response types | `client/src/features/operator/operatorApi.ts` |
| Pages | `client/src/pages/operator/OperatorOrgsPage.tsx`, `OperatorTenantPage.tsx`, `OperatorOnboardingPage.tsx`, `OperatorPlansPage.tsx`, `OperatorOperatorsPage.tsx`, `OperatorAuditPage.tsx`, `OperatorCallbackPage.tsx` |
| Operator API | `server/src/operator/routes.ts` (mounted at `/operator/v1` in `server/src/app.ts`) |
| Auth middleware | `server/src/operator/middleware.ts` (`requireOperator`, `requireOperatorIp`) |
| Account lookup | `server/src/operator/accounts.ts` (`findOperatorAccount`, `hasOperatorRole`) |
| Roles and permissions | `server/src/operator/permissions.ts` (`ROLE_PERMISSIONS`, `permissionsFor`, `requirePermission`) |
| Hosted login pages | `server/src/operator/interactions.ts` |
| Realm config | `server/src/identity/providers.ts` (`buildOperator`), `server/src/identity/config.ts` |
| Seed script | `server/src/scripts/seed-operator.ts` (`npm run seed:operator`) |

## 3. Pages and API endpoints

### 3.1 Client routes

All pages except the callback are inside `OperatorGuard` (no token in memory → refresh if a refresh token exists, else redirect to the operator realm) and the shared `AppShell` with the `operator` config (nav: Organizations, Onboarding, Plans, Operators, Audit; each item shown only with its permission from `GET /me`).

| Route | Component | Uses |
|---|---|---|
| `/operator/callback` | `pages/operator/OperatorCallbackPage.tsx` | `completeOperatorLogin` (code exchange), then navigates to the saved `return_to` or `/operator/organizations` |
| `/operator` | redirect to `/operator/organizations` | |
| `/operator/organizations` | `pages/operator/OperatorOrgsPage.tsx` | `ListPage`: search, status, plan, tag, in-trial filters and sort (all in the URL), create org, suspend/reactivate/close; a row opens the tenant page |
| `/operator/organizations/:id` | `pages/operator/OperatorTenantPage.tsx` | `ObjectPage`: Summary (tags, trial, identity providers with the Entra tenant approval), Products (override, remove override, change plan with preview, seat meter), Onboarding, Admins, Activity, Notes. `?tab=` holds the tab |
| `/operator/onboarding` | `pages/operator/OperatorOnboardingPage.tsx` | `ListPage` over `GET /onboarding`: stage, first admin, invitation sent/expiry, last delivery error, Resend invitation; stage filter in the URL; a row opens the tenant's Onboarding tab |
| `/operator/plans` | `pages/operator/OperatorPlansPage.tsx` | list (organizations on each, trial, version), create, edit (description, products, default seats, trial days), apply to organizations with a dry-run preview |
| `/operator/operators` | `pages/operator/OperatorOperatorsPage.tsx` | list, create, edit operators |
| `/operator/audit` | `pages/operator/OperatorAuditPage.tsx` | audit log with category, operator, date and action filters, detail drawer (before/after/reason), cursor paging, Export CSV |

Client config: `VITE_ID_ISSUER_ORIGIN` (authority = `${VITE_ID_ISSUER_ORIGIN}/realms/operator`), `VITE_OPERATOR_API_URL` (default `http://<host>:5000/operator/v1`). Client id `karbexa-operator-spa` and resource `urn:karbexa:operator` are hard-coded in `operatorAuth.ts`. Logout goes to `/realms/operator/oauth/end_session` with `id_token_hint` and `post_logout_redirect_uri = <origin>/operator`.

### 3.2 API endpoints (`/operator/v1`)

Every route goes through, in order (`server/src/operator/routes.ts:48-55`):
1. Correlation id: echoes `X-Correlation-Id` if it matches `^[\w.-]{1,100}$`, else generates a UUID; set on the response.
2. `requireOperator`: IP allow-list (`OPERATOR_IP_ALLOWLIST`), Bearer token verified locally against the operator realm keys (issuer `${ID_ISSUER_ORIGIN}/realms/operator`, audience `urn:karbexa:operator`, RS256, `typ: at+jwt`, `token_use: 'access'`), then the account must still be active with an operator role. Each route then passes `requirePermission('<perm>')` (403 `FORBIDDEN` without it). Failures: 403 `FORBIDDEN` (IP), 401 `NO_TOKEN` / `INVALID_TOKEN`.

The global per-IP rate limiter in `app.ts` also applies. Envelope: `{ success: true, data, meta? }`.

| Method | Path | Body / query | What it does |
|---|---|---|---|
| GET | `/me` | | The signed-in operator plus `permissions[]` (any operator; the SPA reads it for navigation and buttons) |
| GET | `/orgs` | `limit` (1–100, default 25), `cursor`, `status`, `plan`, `tag`, `trial=true`, `search` (name/slug regex), `sort` (`created` default, `name`, `members`, `last_activity`) | Org summaries; `meta: { total, limit, next_cursor }`. `created` pages by last `_id`; the other sorts page by offset (the cursor is a number). Summary adds `members_total`, `members_active`, `products[]` (active entitlements), `last_activity_at` (also as `last_activity`), `tags`, `trial_ends_at`. 400 on an unknown sort. `attention` filter and `attention_count` arrive with 4.10 |
| GET | `/orgs/:id` | | Summary + `first_admin` (earliest holder of the Super Admin role, through `UserRole`) + `seat_usage[]` (`{ product_key, used, limit, computed_at }`) |
| GET | `/orgs/:id/products` | | Every registered product with the org's entitlement: `status` (`not_entitled` when none), `source`, `plan_key`, `seats_limit`. Also `plan_version` and, for an override, `reason` and `expires_at`; `seats_used` and `seats_computed_at` from `SeatUsage` (null before the first count) |
| GET | `/orgs/:id/admins` | | Members holding Super Admin, Admin, HR Admin, IT Admin or Ops Admin: name, e-mail, roles, `mfa_enabled` (TOTP or e-mail OTP on the identity), `last_login_at`, `status` |
| GET | `/orgs/:id/notes` | `limit`, `cursor` | Internal notes, newest first (`tenants.read`) |
| POST | `/orgs/:id/notes` | `{ body (1–2000) }` | Add a note (`notes.write`); audited `org.note_added`, not mirrored into the tenant audit log |
| DELETE | `/orgs/:id/notes/:noteId` | | The author, or an operator with `tenants.write`; 403 otherwise; audited `org.note_deleted`, not mirrored |
| GET | `/orgs/:id/onboarding` | | Plan 2.6: `{ organization, stage, first_admin, invitation { state, sent_at, sent_count, expires_at, ... }, delivery { status, attempts, last_error, ... } }`. `stage`: `complete`, `no_first_admin`, `no_invitation`, `sending`, `delivery_failed`, `awaiting_acceptance`, `expired`, `revoked`. Never a token |
| POST | `/orgs/:id/onboarding/resend-invite` | | New first-admin invitation (supersedes the current one) and a queued e-mail, one transaction; 409 `ALREADY_ONBOARDED` once the first admin accepted; audited `onboarding.invite_resent` |
| PATCH | `/orgs/:id/onboarding/first-admin` | `{ email, full_name }` | Only while the first admin is `invited`; updates the member, emits `member.updated`, re-issues the invitation to the new address; 409 `EMAIL_IN_USE`, `ALREADY_ONBOARDED`; audited `onboarding.first_admin_changed` |
| GET | `/onboarding` | `?limit&cursor` | Organisations whose first admin has not finished onboarding, each with the same picture and `stage` |
| POST | `/orgs` | `{ name, slug?, plan_key, first_admin: { email, full_name } }` | Provision (see below). Idempotent by slug: an existing slug returns 200 with `already_existed: true`. New org returns 201 with `invite_email_sent` (now "accepted for delivery") and `invite_delivery_id` (the `EmailDelivery` id), and `invite_token` only when `NODE_ENV !== 'production'` and `EXPOSE_INVITE_TOKEN === 'true'` |
| POST | `/orgs/:id/suspend` | `{ reason? }` | Status `suspended`, revoke all org sessions |
| POST | `/orgs/:id/reactivate` | `{ reason? }` | Status `active` (refused with 409 `ORG_CLOSED` if closed) |
| POST | `/orgs/:id/close` | `{ reason? }` | Status `closed`, revoke all org sessions |
| PATCH | `/orgs/:id` | any of `{ plan_key, trial_ends_at (ISO date or null), tags (≤ 10, each ≤ 30) }`; `?dry_run=true` for a plan change | Tags and trial are written and audited `org.updated` (before/after). With `plan_key` (`applyPlanToOrg`, `operator/plans.ts`): set `Company.plan`; each plan product gets an entitlement (`source: 'plan'`, `plan_version`, the seat default when no limit is set; a `restricted` one returns to `active`); operator overrides (`source: 'operator'`) are never touched; plan-sourced entitlements for products no longer in the plan become `restricted` (access off, data kept); default access rules are ensured for newly active products. Answers `{ id, plan_key, products, tags, trial_ends_at, added, restricted, unchanged }`; the dry run answers the same shape as the plan dry run and writes nothing |
| PUT | `/orgs/:id/entitlements/:productKey` | `{ status: 'active'\|'suspended', reason (required), seats_limit?: int\|null, expires_at? }` | Set an override (`source: 'operator'`, shown as "Override"): 400 `REASON_REQUIRED` without a reason; `expires_at` must be in the future and only an active override may carry one; a new PUT replaces the previous override, expiry included; `null` seats clears the limit. Audited `entitlement.updated` with the reason; `entitlement.changed` carries `source`, `seats_limit`, `expires_at` |
| DELETE | `/orgs/:id/entitlements/:productKey/override` | `reason` (query or body, required) | Back to plan state: when the tenant's plan includes the product it becomes plan-sourced and active (plan seat default); otherwise the entitlement is deleted (event status `restricted`). 404 when there is no override. Audited `entitlement.override_removed` |
| GET | `/orgs/:id/identity-providers` | | The org's IdP connections incl. `tenant_approval` |
| POST | `/orgs/:id/identity-providers/:connId/approve-tenant` | | Approve the Entra `config.tenant_id` of the connection. 400 unless `type: 'entra'` with a tenant id; 409 `TENANT_TAKEN` if another connection already has that tenant approved |
| GET | `/plans` | | All plans sorted by key, each with `description`, `seat_defaults`, `trial_days`, `version`, `tenant_count` (non-closed organizations on it) |
| POST | `/plans` | `{ key (^[a-z0-9_-]{2,40}$), name, products[], status?, description?, seat_defaults? ({ productKey: int\|null }), trial_days? (1–365\|null) }` | Create; 409 on duplicate key; 400 `UNKNOWN_PRODUCT` for a product or seat-default key not in the registry |
| PATCH | `/plans/:key` | partial of the same fields | Updates the plan document and raises `version` by one on every edit; existing organizations are not changed until the plan is applied |
| POST | `/plans/:key/apply` | `?dry_run=true` | `plans.write`. Dry run: `{ added[], restricted[], unchanged[] (each { product_key, tenants }), tenants_affected }`, nothing written. Otherwise queues one `plan.apply` job per non-closed organization on the plan (batches of 200) and answers 202 `{ queued, tenants_affected }`; 409 `PLAN_ARCHIVED`. Progress: the `Job` documents (`type: 'plan.apply'`) |
| GET | `/audit` | `limit`, `cursor`, `company_id`, `operator_id`, `category`, `action` (exact), `from`, `to` (ISO dates) | `OperatorAuditEvent` newest first with `category`, `result`, `reason`, `before`, `after`; `meta: { limit, next_cursor }`; 400 on a bad category, id or date. Permission `audit.read` |
| GET | `/audit/export` | same filters | CSV stream (newest first, at most 50,000 rows, formula-safe cells), permission `audit.export`; the export is itself audited as `audit.exported` (category `security`) |
| GET | `/operators` | | All operator accounts (never the hash or secret) |
| POST | `/operators` | `{ email, full_name, password (≥12), roles? }` | Create (bcrypt cost 12, default roles `['platform_admin']`; roles from the four operator roles) |
| PATCH | `/operators/:id` | partial `{ full_name, status ('active'\|'suspended'), roles, password, reset_mfa }` | Update; 409 `SELF_SUSPEND` when suspending yourself. `reset_mfa: true` sets `mfa = { enabled: false }` so the next login re-enrols |

**Provisioning (`POST /orgs`) in order** (`routes.ts`, Plan 2.5, built, tests not yet run):
1. Plan must exist with `status: 'active'` (404 `PLAN_NOT_FOUND`). An existing slug returns 200 `already_existed`.
2. `seedPermissions()` (global, idempotent) runs before the transaction.
3. In **one transaction**: `Company` (created already `active`), system roles and role permissions (`seedSystemRoles(id, session)`), default security policy (`seedSecurityPolicy(id, session)`), entitlements for every plan product (`source: 'plan'`), first admin `User` (`lifecycle_state: 'invited'`, legacy `role: 'Super Admin'`, pre-set `employee_id`), `UserRole` Super Admin, `Invitation` (`kind: 'first_admin'`, sha256 of a random token, 72 h, made by `lib/invitations.createInvitation`), default access rules (section 4), platform events, operator audit + mirrored tenant `AuditEvent`, and the welcome e-mail row in the outbox (`EmailDelivery`, written with the transaction's session).
4. After commit the sender loop delivers the e-mail (in test/`MOCK_EMAIL` mode an after-commit hook does); its fate is in `EmailDelivery.status`, linked from the response as `invite_delivery_id`. `invite_email_sent: true` means "accepted for delivery".
5. On any failure the transaction rolls back and nothing exists for the slug (no company, roles, policy, e-mail or invitation), so the same request can be sent again. There is no cleanup step and no `provisioning` stub.

**Status changes** (`setOrgStatus`, `routes.ts:291-322`): in one transaction set `status`/`is_active`, bump every member's `authz_ver`, mark legacy `RefreshToken`s revoked, revoke live `Session` rows (`revokeSessionsTx`, reason `org_suspended` / `org_closed`), emit the org event, write audit. After commit: tear down provider sessions, then fan out per-member `app_access.changed` in batches of 200.

## 4. Roles and permissions

- Four operator roles (`server/src/operator/permissions.ts`, a static map; DRD 4.5): `platform_admin` (everything), `operations` (tenants, entitlements, onboarding, notes, announcements; no close, plans, audit, operators), `support` (read, notes, resend invitation), `auditor` (read, audit and export, security, operators list). An operator holding several roles gets the union. `products.write` is not defined yet (Phase 6).
- Permission per route: `GET /orgs*`, `/plans`, `/onboarding` `tenants.read`; create, suspend, reactivate, plan assignment, first-admin change, Entra approval `tenants.write`; close `tenants.close`; entitlements `entitlements.write`; resend invitation `onboarding.write`; plan create/update `plans.write`; `GET /audit` `audit.read`; `GET /operators` `operators.read`; create/update operator `operators.write`. `GET /me` needs no permission. `__tests__/permissions.test.ts` walks the router and fails when a route has none.
- TOTP is mandatory for every operator login (section 3 of identity.md); first login enrols.
- IP allow-list `OPERATOR_IP_ALLOWLIST` applies to `/operator/v1` (in `requireOperator`) and to the whole `/realms/operator` realm (`app.use('/realms/operator', requireOperatorIp)` in `server/src/app.ts`). Empty list: allowed outside production, **every request refused with 403 in production**.
- Org default access rules applied at provisioning and on plan assignment (`ensureDefaultAccess` in `routes.ts`, driven by each product's manifest `default_assignments`), each only if the product entitlement is active: dynamic group "All Members" (`dynamic_rules: {}`) gets `people → employee` and `desk → requester`. Product keys in entitlement and plan routes are checked against the registry (`UNKNOWN_PRODUCT`).
- Product role catalogs: see admin.md section 4.3.

## 5. Data models

| Model (file) | Key fields | Notes |
|---|---|---|
| `OperatorAccount` (`server/src/models/OperatorAccount.model.ts`) | `email`, `full_name`, `password_hash`, `mfa.{enabled, secret_enc, verified_at}`, `roles[]`, `status` (`active`/`suspended`/`invited`), `last_login_at`, `failed_attempts`, `locked_until` | `secret_enc` encrypted with `ENCRYPTION_KEY` (`lib/cryptoService.ts`) |
| `OperatorAuditEvent` (`OperatorAuditEvent.model.ts`) | `operator_id`, `operator_email`, `action`, `target_type`, `target_id`, `company_id`, `details`, `category`, `before`, `after`, `reason`, `result`, `correlation_id`, `created_at` | Every operator write. When a company is involved, a tenant `AuditEvent` is also written with `source: 'operator'`, `module: 'operator'`, `actor_email: 'operator:<email>'` |
| `Plan` (`Plan.model.ts`) | `key`, `name`, `products[]`, `status` (`active`/`archived`) | Default plans seeded by `seedProductRegistry` |
| `OrganizationEntitlement` | `company_id`, `product_key`, `status`, `seats_limit`, `source`, `plan_key`, `updated_by_operator_id` | Unique per (company, product) |
| `Company` | `status`, `is_active`, `plan`, `slug`, `tags`, `trial_ends_at`, `last_activity_at` | `last_activity_at` is touched at tenant sign-in, at most hourly |
| `Job` (`Job.model.ts`, runner `lib/jobs.ts`) | `type`, `payload`, `status` (`queued`/`running`/`done`/`failed`), `attempts`, `run_at`, `locked_until`, `last_error`, `finished_at` | Generic background work: atomic claim, handlers by type (`registerJobHandler`), retry after 1, 5, 30, 120 minutes (5 attempts), stale `running` rows reclaimed, finished rows removed after 30 days. First user: `plan.apply` |
| `SeatUsage` (`SeatUsage.model.ts`, `lib/seats.ts`) | `company_id`, `product_key`, `used`, `computed_at` | Seats in use per tenant and product: members in an access state (onboarding, active, probation, on_leave), active, reached by an active assignment of the product's app, while the tenant is active and the entitlement is active. Recomputed (coalesced to once a second per tenant) after every `app_access.changed` emit commits; never on page load |
| `TenantNote` (`TenantNote.model.ts`) | `company_id`, `operator_id`, `operator_email`, `body` (≤ 2000), `created_at` | Internal operator notes; append-only |
| `IdentityProviderConnection` | `tenant_approval.{tenant_id, approved_at, operator_id}` | Written by approve-tenant |
| `oidc_operator_*` | oidc-provider storage | See identity.md |

Operator actions recorded in the audit log: `org.provisioned`, `org.suspended`, `org.reactivated`, `org.closed`, `org.plan_assigned`, `entitlement.updated`, `identity_provider.tenant_approved`, `plan.created`, `plan.updated`, `operator.created`, `operator.updated`.

## 6. Platform events emitted

Actor `{ type: 'operator', id: <operator id> }`, correlation id from the request.

| Event type | Emitted from | `data` |
|---|---|---|
| `org.provisioned` | `POST /orgs` | `{ slug, name, status }` |
| `entitlement.changed` | `POST /orgs` (one per plan product), `PATCH /orgs/:id` (one per plan product), `PUT /orgs/:id/entitlements/:productKey` | `{ product_key, status }` |
| `member.provisioned` | `POST /orgs` (first admin) | `{ email, full_name, lifecycle_state }` |
| `app_access.changed` | `POST /orgs` (first admin, in the transaction); status change, plan assignment and entitlement change (post-commit fan-out via `fanOutAppAccessChanged`, batches of 200) | `{ authz_ver, products }` |
| `org.suspended` / `org.reactivated` / `org.closed` | `POST /orgs/:id/{suspend,reactivate,close}` | `{ reason }` |
| `session.revoked` | suspend / close (one per revoked sid, via `revokeSessionsTx`) | `{ sid, member_id }` |

No events for plan create/update, operator account changes, or IdP tenant approval (comment at `routes.ts:392`: "06 has no IdP event type").

## 7. Status

### Built ✓
- Operator realm with mandatory TOTP and 30 min session: `server/src/identity/providers.ts` `buildOperator`, `server/src/operator/interactions.ts`.
- Operator API with all endpoints in section 3.2, operator audit mirrored into the tenant audit log: `server/src/operator/routes.ts`.
- Transactional provisioning with default access rules; a failure leaves nothing behind.
- Org status changes revoke tenant sessions and propagate access changes.
- IP allow-list, fail-closed in production: `server/src/operator/middleware.ts`.
- Console UI for orgs, plans, operators and audit: `client/src/pages/operator/*`.

### Not built or partial ✗
- **IdP tenant approval has no UI.** `GET /orgs/:id/identity-providers` and `POST .../approve-tenant` exist in the API only; `client/src/features/operator/operatorApi.ts` and the operator pages do not call them. An operator must call the API directly.
- **Operator sessions are in `OperatorSession`, not `Session`** (Plan 0.4). `GET /platform/v1/sessions/revocations?realm=operator` still returns nothing (that feed is tenant-only). Suspending an operator takes effect on the next API call because `requireOperator` re-reads the account; outstanding refresh tokens fail at `extraTokenClaims`.
- **Operator sign-in lockout and sessions (Plan 0.4, built, tests not yet run).** 5 failed passwords or TOTP codes lock the account for 30 minutes (`OperatorAccount.failed_attempts`, `locked_until`; the browser always sees the generic error). Failed, locked and successful sign-ins write `SecurityEvent` rows (`company_id` null, `metadata.realm: 'operator'`). Each token issuance upserts an `OperatorSession` (`operator/sessions.ts`, idle 30 min); `requireOperator` returns 401 `INVALID_TOKEN` for a revoked session (15 s in-process cache). The counter resets on a full sign-in (password and code), not on the password step alone. Smoke cases: `smoke:login`, block "Plan 0.4".
- **Operator TOTP enrolment shows only the setup key and an `otpauth://` link**, no QR code (`renderEnrol` in `server/src/operator/interactions.ts`; the tenant realm renders a QR).
- **Plan edits do not propagate.** `PATCH /plans/:key` changes the plan only; orgs keep their entitlements until `PATCH /orgs/:id` is called again, and that call never removes products.
- `seats_limit` is recorded, not enforced.

### Known issues
- Operator tokens (including the refresh token) are held in memory only (`useOperatorAuthStore`, `operatorAuth.ts`), so a page reload always goes back through `/oauth/authorize` on the operator realm.
- `orgDetail.first_admin` and plan assignment look up the first admin by the legacy `User.role` string (`routes.ts:130`, `:349`), not by `UserRole`.
- Provisioning steps 2 and 3 run outside the transaction (`seedDatabase` takes no session); a crash between steps can leave a `provisioning` company that the catch block did not clean up.
- `GET /orgs` `meta.total` counts with the filter minus the cursor, by design (`routes.ts:119`).

## 8. Tests and how to run them

From `server/`:

| Command | Coverage |
|---|---|
| `npm run smoke:sprint2` | E10 operator login (operator realm, PKCE, mandatory TOTP enrolment), provisioning from a plan, events in the same transaction with one correlation id, entitlement suspension → effective access denial, org suspend/reactivate events with `data.reason`, `OPERATOR_IP_ALLOWLIST` (read per request, `TRUST_PROXY=0`), plan assignment activates products, E4d O(1) org transaction + post-commit fan-out, L3-9 `invite_token` exposure rules, audit. Uses an in-memory replica set and runs the whole app in-process |
| `npm run seed:operator` | Not a test: creates or resets an operator from `OPERATOR_SEED_EMAIL` / `OPERATOR_SEED_PASSWORD` (≥12 chars) / `OPERATOR_SEED_NAME`; refuses in production unless `OPERATOR_SEED_FORCE=true`. MFA state is left unchanged on reset |

There are no `__tests__` unit tests specific to `server/src/operator/`. The client has no automated tests.
