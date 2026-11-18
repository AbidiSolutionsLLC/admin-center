# Admin Center: architecture

The Admin Center is the tenant-facing half of the Admin repo: a React single-page app (`client/`) calling the tenant API (`/api/v1`, `server/`). Repo-wide layout, middleware order and the transaction pattern are in `../ARCHITECTURE.md`; sign-in and tokens in `../identity/ARCHITECTURE.md`. This file covers what is specific to tenant administration.

## Request flow

`browser (AuthGuard, apiClient)` -> `/api/v1/*` -> `globalLimiter` -> area router (`server/src/routes/<area>.routes.ts`: `router.use(requireAuth)` and per-route `requireRole(PERMISSION_GROUPS.X)`) -> controller (`server/src/controllers/<area>.controller.ts`, wrapped in `asyncHandler`, zod validation at the boundary) -> models (`server/src/models/*.model.ts`) -> `errorHandler` (`{ success: false, error, code }`).

`requireAuth` (`server/src/middleware/auth.ts`) verifies the access token locally, loads the member, requires a live `Session`, resolves the highest-ranked org role, applies organisation suspension (423 `ORG_SUSPENDED`) and IP restriction rules, and sets `req.user = { userId, email, user_role, company_id, sid, identity_id }`. Details: `../ARCHITECTURE.md` section 4.

## Tenant scoping

The tenant is `req.user.company_id`, taken from the token's `org` claim only after `requireAuth` confirms the member belongs to that organisation. Controllers filter every query by `company_id` and look records up by `_id` **and** `company_id` (examples: `getEffectiveAccess` and `updateAssignment` in `appAccess.controller.ts`, `terminateSession` in `security.controller.ts`). System product `App` rows have no `company_id`; tenant code reads them with `$or: [{ company_id }, { company_id: { $exists: false } }]`. `auditLogger.log` refuses an entry without `company_id`; `logTx` throws.

## Changes that affect access or members

Do the domain write, `auditLogger.logTx(session, ...)` and `emitPlatformEvent(session, ...)` inside one `runInTransaction` (`server/src/lib/platformEvents.ts`, `server/src/lib/auditLogger.ts`). Bump `authz_ver` when effective access changes (`emitAppAccessChanged`). Post-commit work (provider session teardown, large fan-outs) goes in `onCommit` hooks. Areas **not** on this pattern (no `runInTransaction`, no platform events): policies, workflows, data fields, integrations, IP restrictions, identity providers.

## App Access and effective access

- An `AppAssignment` grants a product role to a target (`user`, `group`, `role`, `department`, `location`, `attribute`). `computeEffectiveAccess` (`server/src/lib/effectiveAccess.ts`) evaluates them; the rules are in `ACCESS.md`.
- Product keys are data: `server/src/lib/productRegistry.ts` (`listProducts`, `getProduct`, `assertProductKey`, 60 s cache) reads `App` rows with `app_type: 'karbexa_product'`; `admin` is reserved. Unknown keys fail with 400 `UNKNOWN_PRODUCT`. Role catalogs and manifests: `server/src/lib/productCatalog.ts` (`seedProductRegistry`, `npm run seed:products`).
- Seats: `server/src/lib/seats.ts` recomputes `SeatUsage` after every `app_access.changed` commit; `assignApp` and `updateAssignment` refuse beyond the limit with 409 `SEAT_LIMIT_REACHED`.
- Products learn the result through `app_access.changed` events and `GET /platform/v1/orgs/:orgId/members/:memberId/effective-access`.

## Client structure

| Layer | Files |
|---|---|
| Entry, routes, guards | `client/src/main.tsx`, `client/src/App.tsx`, `client/src/constants/routes.ts`, `client/src/components/layout/AuthGuard.tsx` |
| Shell and navigation | `client/src/components/layout/AppShell.tsx`, `navigation.ts` (`ADMIN_SHELL`), `shells.tsx` (`TenantShell`) |
| Page templates | `client/src/components/templates/` (`ListPage`, `ObjectPage`, `DashboardPage`, `PageStates`) |
| Data | TanStack Query hooks in `client/src/features/<area>/hooks/`; query keys in `client/src/constants/queryKeys.ts` |
| Auth | `client/src/lib/oidc.ts`, `session.ts`, `apiClient.ts`; memory-only store `client/src/store/useAuthStore.ts` |
| Permissions in the UI | `client/src/hooks/useMyPermissions.ts` (fed by `GET /auth/my-permissions`), `components/ui/PermissionGate.tsx` |

## Background jobs that touch this portal

| Job | File | Period |
|---|---|---|
| Escalations | `server/src/lib/escalationEngine.ts` | 5 min |
| Audit retention | `server/src/lib/auditRetention.ts` | 24 h and at start |
| Intelligence (insights) rules | `server/src/lib/intelligence.ts` | 60 s and at start |
| Invitation reminder and retention | `server/src/lib/invitationJobs.ts` | reminder every 30 min, retention nightly |
| E-mail outbox sender | `server/src/lib/emailSender.ts` | 5 s loop, retries at 1, 5, 30 and 120 min |

## External services

MongoDB replica set (transactions, audit change stream); Azure Communication Services or SMTP for e-mail (`server/src/lib/emailService.ts`); the products backend for offboarding open items (`GET /people/:id/product-open-items`, outbound token in `server/src/platform/productsInternalToken.ts`); DNS TXT lookups for identity-provider domain verification.

## Events produced

All are written with `emitPlatformEvent` inside a `runInTransaction` together with the domain change and an `auditLogger.logTx` row. Actor is `{ type: 'member', id: <caller> }`. Envelope, delivery and the full type catalogue: `../platform-api/API.md`.

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

No platform events are emitted by policies, workflows, data fields, integrations, notifications, IP restrictions, identity providers, security policies or teams (teams writes are transactional but emit no event).

## Patterns to copy for new code

| Layer | Exemplary file |
|---|---|
| Router | `server/src/routes/groups.routes.ts` |
| Transactional controller (write, audit, event) | `server/src/controllers/groups.controller.ts` |
| Read controller with tenant scoping | `server/src/controllers/appAccess.controller.ts` (`getEffectiveAccess`) |
| Hook plus page | `client/src/features/apps/` and `client/src/pages/apps/AppsPage.tsx` |
| Page on a template | `client/src/pages/audit-logs/AuditLogsPage.tsx` (`ListPage`), `client/src/pages/people/UserDetailPage.tsx` (`ObjectPage`) |
