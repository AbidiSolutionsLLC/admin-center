# Command Center (operator console)

The console Karbexa staff use to run the platform: provision organisations from a plan, suspend, reactivate or close them, manage plans, entitlements and seats, follow onboarding, watch platform health and attention items, manage operator accounts, and read the operator audit log. It is the operator half of the Admin repo: the `/operator` section of the Admin web app, the Operator API (`/operator/v1`), and the operator sign-in realm. Tenant administration is in `../admin-center/`, sign-in in `../identity/`, the machine API in `../platform-api/`.

## Users and roles

| Operator role | Can do |
|---|---|
| `platform_admin` | Everything, including close organisation, plans, operators, audit and security |
| `operations` | Tenants, entitlements, onboarding, notes, announcements; no close, plans, audit or operators |
| `support` | Read, notes, resend an invitation |
| `auditor` | Read, audit log and export, security, operators list; changes nothing |

Operators are `OperatorAccount` documents in their own collection and realm, not tenant members. Permission map: `ACCESS.md`.

## Code map

| Area | Path |
|---|---|
| Client routes and shell | `client/src/App.tsx` (operator block), `client/src/constants/routes.ts` (`OPERATOR_*`), `client/src/components/layout/shells.tsx` (`OperatorShell`), `navigation.ts` (`OPERATOR_SHELL`) |
| Guard, token store, API client | `client/src/features/operator/OperatorGuard.tsx`, `operatorAuth.ts` (memory only), `operatorApi.ts` (hooks and response types) |
| Pages | `client/src/pages/operator/Operator*Page.tsx`, `CreateOrgDialog.tsx`, `AnnouncementDialog.tsx` |
| Operator API | `server/src/operator/routes.ts` and the files it mounts (`tenants.ts`, `plans.ts`, `onboarding.ts`, `overrides.ts`, `overview.ts`, `health.ts`, `security.ts`, `sessions.ts`, `audit.ts`, `announcement.ts`, `inviteAccept.ts`) |
| Auth and permissions | `server/src/operator/middleware.ts` (`requireOperator`, `requireOperatorIp`), `permissions.ts` (`ROLE_PERMISSIONS`, `requirePermission`), `accounts.ts`, `signInGuard.ts` |
| Operator sign-in pages | `server/src/operator/interactions.ts` |
| Signals, health, seats, jobs | `server/src/lib/signals.ts`, `server/src/lib/health/`, `server/src/lib/seats.ts`, `server/src/lib/jobs.ts`, `server/src/lib/overrideJobs.ts` |
| Invitations and e-mail | `server/src/lib/invitations.ts`, `emailService.ts`, `emailSender.ts` |
| Seed | `server/src/scripts/seed-operator.ts` (`npm run seed:operator`) |
| Playwright specs | `client/e2e/operator-*.spec.ts` |

## Run it locally

Whole platform: `node scripts/dev.mjs` from the workspace root. Admin only: start the server and client as in `../admin-center/README.md`, then create the first operator: `cd server && npm run seed:operator` (from `OPERATOR_SEED_EMAIL`, `OPERATOR_SEED_PASSWORD` of at least 12 characters, `OPERATOR_SEED_NAME`; refuses in production unless `OPERATOR_SEED_FORCE=true`). Console: `http://admin.karbexa.localhost:5173/operator`; sign-in enrols TOTP on first use.

Tests: `cd server && npm test` (`src/operator/__tests__/`, `lib/__tests__/signals.test.ts`, `health.test.ts`, `invitations.test.ts`) and `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2`; `cd client && npx playwright test e2e/operator-*.spec.ts`; real-stack walk `npm run walk:server` with `node client/e2e-real/walk.mjs` (`WALK_ONLY=operator`). Results: `STATUS.md`.

## Non-negotiable rules

- Every operator route sits behind `requireOperator` and carries a permission mark (`requirePermission`, `anyOperator` or `publicRoute`); `permissions.test.ts` walks the router and fails when one has none.
- Operators see tenant metadata, never tenant business data. Every write is audited in `OperatorAuditEvent`; a write that concerns an organisation is also mirrored into that tenant's audit log with `source: 'operator'`.
- The IP allow-list `OPERATOR_IP_ALLOWLIST` fails closed in production (empty list refuses every request with 403).
- TOTP is mandatory for every operator sign-in; lockout after 5 failures.
- Suspend and close require a reason and the slug typed back. An entitlement override needs a reason.
- Provisioning is one transaction: a failure leaves nothing behind for the slug.
- Org-scoped sub-resources are looked up by `_id` and `company_id`.
- Never return an operator's password hash or TOTP secret; invitation tokens are never stored or returned except `invite_token` outside production with `EXPOSE_INVITE_TOKEN=true`.

## The other files

[PRD](PRD.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA-MODEL](DATA-MODEL.md) · [API](API.md) · [ACCESS](ACCESS.md) · [UI](UI.md) · [STATUS](STATUS.md) · [DECISIONS](DECISIONS.md).
