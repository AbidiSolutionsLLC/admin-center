# Admin Center: product requirements

Source of truth for tenant administration. State is read from the code and `STATUS.md` (2026-11-18), not from older plans. "Spec ref" is the numbering of the meta repo `docs/spec/01-MASTER-PRD.md` section 7 and 5.2 (history). Features are never deleted, only marked `dropped` with a date.

## Personas

| Persona | Needs |
|---|---|
| Org admin / Super Admin | Get the organisation running quickly; decide who uses what |
| HR admin | Members, lifecycle, structure, calendars |
| IT / security admin | App Access, sessions, MFA, SSO, IP rules, audit |
| Ops admin | Locations, policies, workflows, data fields |
| Member (customer) | Open the right product from the launcher |

## Features

| ID | Feature | Spec ref | Priority | State | Acceptance criteria |
|---|---|---|---|---|---|
| ADM-001 | Members: invite (single and bulk), edit, lifecycle changes, offboarding (archive), unlock, MFA reset, bulk lifecycle, role and location | | Must | built | `smoke:sprint2` E4b and E4d blocks; every write audited and emits events in one transaction |
| ADM-002 | Invitation panel on the member profile: state, sent time, expiry, delivery status, resend, revoke, copy link (audited) | ON-5 | Must | built | Playwright `invitation-panel.spec.ts` (not run); `smoke:sprint2` 2.4 block |
| ADM-003 | Activation page with six outcomes (valid, expired, superseded, accepted, revoked, not found), one-click renewal, atomic single-use accept | ON-1 to ON-3, ON-10, ON-11 | Must | built | `smoke:login` 2.2 block; Playwright `activation.spec.ts` (not run) |
| ADM-004 | Organisation structure: departments, business units, teams, locations, reporting lines | | Must | built | `smoke:sprint2` E4b, E4c; events `org_structure.changed`, `reporting_line.changed` |
| ADM-005 | Holiday calendars, holidays, work schedules and their assignments to locations | | Should | built | Event `calendar.changed`; route order covered by `routeOrder.test.ts`. Event-driven calendars in the products app (E8) are not built |
| ADM-006 | Groups: static and dynamic (rules), members | | Must | built | `groupAccess.test.ts`; delete blocked with 409 `GROUP_IN_USE` while an App Access rule targets it |
| ADM-007 | Org roles (system and custom), granular permissions, access map, simulate, grant hierarchy | | Must | built | `security-baseline.test.ts` |
| ADM-008 | App Access: assignments of a product role to users, groups, roles, departments, locations or attributes; effective access with "why this role"; `/me/apps` launcher | AC-3 | Must | built | `smoke:sprint2` E3, E4a; Playwright `admin-apps.spec.ts` (not run) |
| ADM-009 | Subscription page: plan, products, seats, trial end, as set by operators (read-only) | AC-4 | Must | built | Playwright `admin-subscription.spec.ts` (not run) |
| ADM-010 | Member Access panel: products, role, the rule that grants it | AC-5 | Must | built | Playwright `admin-member-profile.spec.ts` (not run) |
| ADM-011 | Seat limits enforced when an assignment is made (409 `SEAT_LIMIT_REACHED`); existing access never removed | S-5 | Must | built | `smoke:sprint2` seat block |
| ADM-012 | Security: policies, IP restrictions, security events, active sessions with revoke, force logout | AC-6 | Must | built | `smoke:sprint2` 5.2 block |
| ADM-013 | Identity providers: Entra connection, DNS TXT domain verification, operator tenant approval, SSO enforcement | | Should | built | `identityProviders.test.ts`; `smoke:sprint2` A3-1 block |
| ADM-014 | Audit log with filters, detail, CSV and JSON export that work for built-in roles | AC-7 | Must | built | `smoke:sprint2` 5.3 block |
| ADM-015 | Live audit stream (SSE with single-use ticket) | | Could | partial | Server built (`streamTickets.test.ts`); no client page consumes it |
| ADM-016 | Setup checklist on Overview, derived from live data, skippable | AC-8, ON-8 | Should | built | Playwright `admin-overview-checklist.spec.ts` (not run) |
| ADM-017 | Policies, workflows, approvals, templates | | Should | built | Emit no platform events and are not transactional (accepted gap) |
| ADM-018 | Data fields, integrations, notifications, insights | | Should | built | `test-datafield-validation`, `test-datafield-api` scripts |
| ADM-019 | Company settings (name, time zone, locale, employee id format, required fields, retention, insight sensitivity) | | Must | built | Event `org.updated` per change |
| ADM-020 | Every page on the shared templates and kit; navigation by permission in the AC-10 groups | AC-1, AC-2, AC-10 | Must | partial | 17 pages migrated; feature components under `client/src/features/*` still hold off-theme colours; page buttons on Apps, Groups, Roles, Teams use the legacy role; no External page |
| ADM-021 | Platform announcement banner (tenant side) | CC-AN-1 | Could | built | `GET /announcement`, `AnnouncementBanner`; the products app banner is not built |
| ADM-022 | External members list and self-registration switch per product | AC-9 | Must for Zyntrus | planned (deferred by decision S-DEFER; no task id) | Not built |
| ADM-023 | People page on server-side paging and filters | | Should | planned (no task id) | The API is paged; the page and pickers still read every page |
| ADM-024 | Admin launcher lists standalone portals (absolute URL, per-tenant override first) | | Must for Assets and Zyntrus | built (WS-C C-6; `GET /me/apps` tenant URL first since W2-2), tests not run | Tiles open in a new tab |
| ADM-025 | Demo organisation "Acme Demo" created through the real API (`npm run seed:demo`) | | Should | built (WS-A A-1): `--memory` self-check passed 2026-11-18 (16 active members, 12 app assignments, 66 platform events); full run with `dev.mjs --demo` is Wave 3 | `--memory` self-check prints 16 active members and exits 0 |
| ADM-026 | Public invitation routes hardened: dedicated limiter on verify (30 per 15 min per IP), renew answers before any e-mail work, renew only for the newest expired invitation | | Should | built (WS-A A-3, A-4, A-5), smoke cases written, not run | Smoke cases in `smoke-oidc-login.ts` |
| ADM-027 | Entra JIT member creation | | Could | planned (no task id; see `../identity/PRD.md` IDN-008) | |
| ADM-028 | Audit hash chain (E9) | | Could | planned (no task id; backlog after go-live) | |

## Non-goals

- Billing, feature flags, deployments, support-access sessions (decision S-9).
- Org provisioning, plans and entitlements (Command Center: `../command-center/PRD.md`).
- Sign-in pages (`../identity/PRD.md`).
- Product data (People, Projects, Sign, Desk live in `karbexa-products`).
