# Command Center: product requirements

Source of truth for the operator console. State is read from the code and `STATUS.md` (2026-11-18). "Spec ref" is the numbering of the meta repo `docs/spec/01-MASTER-PRD.md` (meta repo tag `docs-before-standard`) section 6 and 5.2 and `02-MASTER-DRD.md` sections 3 to 5 and 7 (history). Principles: status first, drill down second; every number links to the list behind it; operators see tenant metadata, never tenant business data; every write is audited. Features are never deleted, only marked `dropped` with a date.

## Personas

| Persona | Needs |
|---|---|
| Platform admin | Everything; manages operators and plans |
| Operations | Create tenants, fix onboarding, change plans and entitlements |
| Support | Find a tenant, read its state, resend an invitation, leave a note |
| Auditor | Read everything, export the audit log, change nothing |

## Features

| ID | Feature | Spec ref | Priority | State | Acceptance criteria |
|---|---|---|---|---|---|
| CMD-001 | Four operator roles with a static permission map; navigation and buttons follow the role, the API enforces it | CC-OP-1 | Must | built | `permissions.test.ts` (every route has a mark); `smoke:sprint2` |
| CMD-002 | Overview: tiles (tenants, trial, onboarding, active members), platform status, Attention required (top 10 with link), recent activity; each section fails on its own | CC-OV-1 to CC-OV-5 | Must | built | Playwright `operator-overview.spec.ts` (not run) |
| CMD-003 | Tenant directory: search; filter by status, plan, tag, trial; sort by created, name, members, last activity; columns per spec | CC-TN-1 | Must | partial | The "needs attention" filter and `attention_count` are not built; Overview links to the tenant instead |
| CMD-004 | Tenant profile with tabs: Summary (tags, trial, identity providers with Entra tenant approval), Products, Onboarding, Admins, Activity, Notes | CC-TN-2 | Must | built | Playwright `operator-tenant.spec.ts` (not run) |
| CMD-005 | Suspend, reactivate, close with a reason; suspend and close need the slug typed back; sessions revoked and access fanned out | CC-TN-3 | Must | built | `smoke:sprint2` org status block; `operator-confirm-announce.spec.ts` (not run) |
| CMD-006 | Internal notes and tags per tenant, never visible to the tenant | CC-TN-4 | Should | built | `smoke:sprint2` 7.3 notes isolation |
| CMD-007 | Create tenant in three steps (organisation and plan, first admin, review) with a transactional provisioning that leaves nothing behind on failure | CC-TN-5, ON-7 | Must | partial | Built and transactional; the spec's `provisioning_failed` state with a recorded step and retry does not exist because a failed provisioning rolls back entirely (`DECISIONS.md` 4.10) |
| CMD-008 | Plans: list, create, edit (description, products, seat defaults, trial days, version), product choices from the registry | CC-PL-1 | Must | built | `plans.test.ts`; `operator-plans.spec.ts` (not run) |
| CMD-009 | Apply a plan to existing tenants with a dry-run preview; products removed from the plan become `restricted` (access off, data kept); one `plan.apply` job per tenant | CC-PL-2 | Must | built | `smoke:sprint2` plan apply block |
| CMD-010 | Change a tenant's plan with a before/after preview | CC-PL-3 | Must | built | `PATCH /orgs/:id?dry_run=true` |
| CMD-011 | Entitlement override with mandatory reason and optional expiry, labelled "Override", expires automatically | CC-PL-4 | Must | built | `smoke:sprint2` override block; job `lib/overrideJobs.ts` |
| CMD-012 | Seats: limit per product per tenant, usage shown, warning at 90 percent; Admin Center blocks assignments beyond the limit | CC-PL-5 | Must | built | `smoke:sprint2` seat block |
| CMD-013 | Trial end date per tenant, extendable; flagged in Attention required on expiry | CC-PL-6 | Should | built | `signals.test.ts` |
| CMD-014 | Onboarding list with stage and the one action that moves it forward (resend invitation, change first-admin e-mail while not accepted) | CC-ON-1, ON-6 | Must | built | `onboarding.test.ts`; `operator-onboarding.spec.ts` (not run) |
| CMD-015 | Platform health: nine components with last-checked time, three states with written thresholds, overall = worst, 7-day history of state changes | CC-PH-1, CC-PH-3, CC-PH-5 | Must | built | Nine components since WS-C C-6 added `standalone_portals` (probe through the SSRF guard, 5 s, degraded after 3 failures, never critical; counts undelivered back-channel logouts); tests written, not run |
| CMD-016 | Per-tenant products sync table (lag, parked events, last error) from the products internal health route | CC-PH-2 | Must | built | `GET /health/sync`; `operator-health.spec.ts` (not run) |
| CMD-017 | Build version and start time of each service | CC-PH-4 | Should | planned (no task id) | Not in the health payload today |
| CMD-018 | Operators list with role, status, MFA state, last sign-in, sessions; suspend, reset password, reset MFA, revoke sessions; last active `platform_admin` cannot be suspended or demoted | CC-OP-2 | Must | built | `smoke:sprint2` C7 cases (passed on `feat/demo-fixes`); `operator-operators.spec.ts` (not run) |
| CMD-019 | Operators are invited and set their own password; direct create with a typed password is retired | CC-OP-3 | Should | built | Direct `POST /operators` removed (WS-A A-6; smoke case expects 404, not run) |
| CMD-020 | Operator sign-in lockout and security events | CC-OP-4 | Must | built | `smoke:login` "Plan 0.4" block |
| CMD-021 | Audit log: filters (tenant, operator, category, action, dates), detail with before, after, reason, correlation id; CSV export (audited, formula-safe) | CC-AU-1 to CC-AU-3 | Must | built | `audit.test.ts`; `operator-audit.spec.ts` (not run) |
| CMD-022 | Security page: operators without MFA, failed sign-ins (24 h), locked accounts, active sessions with revoke, tenants whose admins have no MFA, recent role changes | CC-SE-1 | Must | built | `operator-security.spec.ts` (not run) |
| CMD-023 | Products catalogue (read-only): status, category, manifest version, roles, tenants active, suspended, restricted | | Should | built | `operator-products.spec.ts` (not run) |
| CMD-024 | Operator invitation accept page: set password, TOTP enrolled at first sign-in; verify and accept are public, behind the IP allow-list | plan 04 C2 | Should | built (smoke passed on `feat/demo-fixes`) | `operator-accept-invite.spec.ts` (not run, Wave 3) |
| CMD-025 | One platform announcement shown as a banner in Admin Center and the products app | CC-AN-1 | Could | partial | Operator editor and Admin Center banner built; the products app banner and the Platform API proxy are not built |
| CMD-026 | Entra tenant approval from the tenant profile | | Should | built | `useOrgIdps` and the approve mutation in `operatorApi.ts` |
| CMD-027 | Register a standalone portal (form, secret shown once, rotate secret), per-tenant launch URL | PRD 4.4 SP-1 to SP-9 | Must for Assets and Zyntrus | partial: registration form, secret once and rotate built (WS-C C-1, C-7), tests not run; per-tenant launch URL has an API but no screen | Spec: DRD section 8 (meta tag `docs-before-standard`); `operator-standalone.spec.ts` |
| CMD-028 | Operator audit unified with the tenant audit hash chain (E9) | | Could | planned (no task id; after go-live) | |

## Non-goals (decision S-9)

Billing operations, deployments and releases, feature flags, support-access sessions, data operations, templates, notification routing, compliance and retention. Recommended order when the time comes: support access first, then feature flags, then billing.
