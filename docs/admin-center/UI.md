# Admin Center: what the user sees

Design language of this repo: `../../DESIGN.md` (dark glass theme, tokens only, one amber primary button per view). Signed-out and sign-in screens: `../identity/UI.md`.

## Navigation

`client/src/components/layout/navigation.ts` (`ADMIN_SHELL`) is the menu. An item shows when `GET /auth/my-permissions` grants its seeded permission key (`module:action:scope`, or `module:action` for any scope). An item may also name `roles`, a mirror of the server router's `requireRole` list, so the menu never offers a page the server refuses (plan 04 C1: Audit log needs Super Admin or IT Admin; Company needs Super Admin or Admin). The menu is a convenience; the server guards enforce. Groups: Home, People, Organisation, Apps & Access, Security & Governance, Settings. No External page exists yet (planned with external members, not scheduled).

## Routes (`client/src/App.tsx`)

Guards: `GuestGuard` redirects to `/overview` when a token is in memory. `AuthGuard` tries a refresh, else starts login. Pages under `AuthGuard` render inside `TenantShell` (`AppShell` with the admin config).

Guards: `GuestGuard` redirects to `/overview` when a token is in memory. `AuthGuard` tries a refresh, else calls `startLogin()` (redirect to the tenant realm). Pages under `AuthGuard` render inside `AdminShell`.

| Route | Guard | Component |
|---|---|---|
| `/auth/callback` | none | `pages/auth/CallbackPage.tsx` |
| `/login` | Guest | `pages/auth/LoginPage.tsx` (button that starts OIDC login; shows a signed-out note when `?signed_out` is present) |
| `/forgot-password` | Guest | `pages/auth/ForgotPasswordPage.tsx` |
| `/reset-password` | Guest | `pages/auth/ResetPasswordPage.tsx` |
| `/onboarding` | Guest | `pages/auth/OnboardingPage.tsx` (invite acceptance: verifies the link on load and shows the form or one of five notices, built with `components/ui/AuthNotice.tsx`; e-mail is read-only; hooks in `features/auth/hooks/useInvitation.ts`) |
| `/` | Auth | redirect to `/overview` |
| `/overview` | Auth | `pages/overview/OverviewPage.tsx` |
| `/overview/insight-history` | Auth | `pages/overview/InsightHistoryPage.tsx` |
| `/organization`, `/organization/:id` | Auth | `pages/organization/OrganizationPage.tsx` |
| `/company/settings` | Auth | `pages/company/CompanySettingsPage.tsx` |
| `/teams` | Auth | `pages/teams/TeamsPage.tsx` |
| `/people` | Auth | `pages/people/PeoplePage.tsx` |
| `/people/:id` | Auth | `pages/people/UserDetailPage.tsx` (elevation 5.6: on the `ObjectPage` template, header with state badges, Edit action and overflow (Unlock, Resend invite, Offboard), key facts, URL-synced tabs; the Invitation panel shows on Profile for invited members; the Product access tab shows the assignments behind each role from `reasons`; includes product access tab, effective access, security panel with MFA reset, product open items) |
| `/roles`, `/roles/:id` | Auth | `pages/roles/RolesPage.tsx` |
| `/groups` | Auth | `pages/groups/GroupsPage.tsx` |
| `/apps` | Auth | `pages/apps/AppsPage.tsx` (App Access) |  <!-- 5.4: product cards show a seat meter, default role, or a locked state with the plan that includes it; the selected product has a "Why does this person have this role?" section (`features/apps/EffectiveAccessPanel.tsx`). Buttons on this page still use the legacy role checks. -->
| `/subscription` | Auth | `pages/subscription/SubscriptionPage.tsx` (read-only: plan, products, seats, trial; source `operator` is labelled "Override") |
| `/security` | Auth | `pages/security/SecurityPage.tsx` |
| `/audit-logs` | Auth | `pages/audit-logs/AuditLogsPage.tsx` |
| `/policies`, `/policies/:id` | Auth | `pages/policies/PoliciesPage.tsx` |
| `/locations` | Auth | `pages/locations/LocationsPage.tsx` (also hosts the holidays and work-schedules tabs) |
| `/locations/:id` | Auth | `pages/locations/LocationDetailPage.tsx` |
| `/holidays` | Auth | redirect to `/locations?tab=holidays` |
| `/work-schedules` | Auth | redirect to `/locations?tab=work-schedules` |
| `/data-fields` | Auth | `pages/data-fields/DataFieldsPage.tsx` |
| `/integrations` | Auth | `pages/integrations/IntegrationsPage.tsx` |
| `/workflows` | Auth | `pages/workflows/WorkflowsPage.tsx` |
| `/approvals` | Auth | `pages/workflows/ApprovalsPage.tsx` |
| `/notifications` | Auth | `pages/notifications/NotificationsPage.tsx` |

`ROUTES.TEAM_DETAIL` and `ROUTES.HOLIDAY_CALENDAR_DETAIL` are defined in `constants/routes.ts` but have no `<Route>`.

Navigation (`components/layout/navigation.ts`, `AppShell.tsx`) is cosmetic and permission-driven (elevation 5.1): each item names a seeded permission key (`module:action:scope`, or `module:action` for any scope) and shows when `/auth/my-permissions` grants it; the legacy `userRole` is no longer used. Groups follow PRD AC-10: Home, People, Organisation, Apps & Access, Security & Governance, Settings (no External page exists yet). The server enforces access independently with `requireRole`.

`ROUTES.TEAM_DETAIL` and `ROUTES.HOLIDAY_CALENDAR_DETAIL` are defined in `constants/routes.ts` and have no `<Route>`.

## Pages: purpose, data, actions

Action visibility follows `PermissionGate` and the guard groups of `ACCESS.md`. Every page built on a template shows the states loading (`TableSkeleton`), empty (`EmptyState`), error (`ErrorState`), no permission and populated; pages not yet fully on a template use `PageStates` for loading and error.

| Page | Purpose | Data source (endpoints, see `API.md`) | Actions and who |
|---|---|---|---|
| Overview | Setup checklist, stats, insights, recent activity | `/overview/stats`, `/overview/setup-progress`, `/overview/recent-activity`, `/overview/intelligence` | Run, resolve, dismiss insights: `INSIGHT_ADMINS` |
| Organization | Department and business-unit tree, health, history | `/organization*` | Create, edit, move, delete: `ROLE_ADMINS` |
| Company settings | Name, time zone, locale, employee-id format, required fields, domain enforcement, retention | `/company/settings*` | Super Admin, Admin |
| Teams | Teams and members | `/teams*` | `ROLE_ADMINS` |
| People | Member list with filters and counts | `/people` (paged), `/people/export` | Invite, bulk actions: `PEOPLE_ADMINS` |
| Member profile | Header with state badges, key facts, tabs (profile, product access with "granted via", security, history); invitation panel for invited members; product open items | `/people/:id*` | Edit, offboard, resend invite, copy link, revoke invitation: `PEOPLE_ADMINS`; unlock; MFA reset: `IT_ADMINS` |
| Admin roles | Roles, permissions, access map, simulate | `/roles*` | `ROLE_ADMINS`; delete: Super Admin |
| Groups | Static and dynamic groups | `/groups*` | `ROLE_ADMINS`; delete: Super Admin |
| Apps & Access | A card per product (seat meter, default role, or a locked state naming the plan that includes it); assignments; "Why does this person have this role?" | `/apps*`, `/organization/subscription`, `/people/:id/effective-access` | Assign, change role, revoke: `IT_ADMINS` |
| Subscription | Read-only plan, products, seats, trial (an operator override is labelled "Override") | `/organization/subscription` | none |
| Security | Tabs (URL-synced `?tab=`): policies, IP restrictions, identity providers, active sessions, events | `/security/*` | `IT_ADMINS` |
| Audit log | Filterable audit events, detail, export | `/audit-logs*` | Read: Super Admin, IT Admin; export needs `audit_logs:export:all` |
| Policies, Workflows, Approvals | Policy versions and assignments; workflow builder; pending approvals | `/policies*`, `/workflows*`, `/approvals*` | `OPS_ADMINS`; approve or reject: any signed-in approver |
| Locations (with holidays and work-schedules tabs), Location detail | Location tree, calendars, schedules | `/locations*`, `/holidays*`, `/work-schedules*` | `OPS_ADMINS` |
| Data fields, Integrations, Notifications | Custom fields and layouts; connectors; templates and in-app notifications | `/data-fields*`, `/integrations*`, `/notifications*` | Super Admin and Ops Admin write; Super Admin deletes |
| Insight history | Past insights | `/intelligence/history` | read |
| Setup, activation, reset | See `../identity/UI.md` | | |

The shell also shows the platform announcement banner (`components/layout/AnnouncementBanner.tsx`, `GET /announcement`) and an app launcher (`components/layout/AppLauncher.tsx`, `GET /me/apps`): each tile opens its portal in this tab (`data-testid=launcher-same-<key>`) and a small arrow opens it in a new tab (`launcher-new-<key>`). The top-bar search box has no handler yet.

## Setup checklist and template roll-out

### Setup checklist (elevation 5.7)

`GET /overview/setup-progress` also returns `checklist`: four steps (organisation structure, security policy edited, more than one member, an active app assignment) derived from live data, each query scoped by `company_id`; `Company.setup_progress` is not used. The Overview shows it (`features/overview/SetupChecklist.tsx`) until every step is done; "Skip for now" is remembered per browser.

### Template roll-out (elevation 5.8 to 5.10)

Pages are wrapped in the Phase 3 templates (`PageHeader`, `ListPage`, `Tabs`, `PageStates`) and off-theme colour classes in the page files are replaced by theme tokens (`bg-surface`, `text-ink`, `border-line`, `error`/`warning`/`success`/`info`); soft accents come from the `--accent-*` CSS variables in `client/src/index.css`. Feature components under `client/src/features/*` were not restyled.

- Batch 1 (5.8, built; run in Phase 7, 2026-11-17): Security (URL-synced tabs `?tab=`), Audit log (`ListPage`; export buttons now check `audit_logs:export`, as the server does), Data fields, Approvals (`ListPage`, all five states), Integrations, Insight history (chart colours from CSS variables).
- Batch 2 (5.9, built; run in Phase 7, 2026-11-17): Teams, Organization structure and Notifications (shared `PageHeader`, loading and error through `PageStates`), Groups and Admin roles (`ListPage` with toolbar search, all five states; roles keep the list/map toggle in the toolbar and move Simulate access to the overflow menu), Location detail (`ObjectPage`: header, status badges, key facts, URL-synced tabs).
- Batch 3 (5.10, built; run in Phase 7, 2026-11-17; wrap only, page internals untouched): People, Policies, Workflows (shared `PageHeader`, loading and error through `PageStates`), Locations (header, loading and error of the locations tab through `PageStates`), Company settings (`PageHeader`, `PageStates`). Off-theme classes and raw hex in these page files and in `pages/*/components` are replaced; `bg-white/5` overlays became `bg-surface-alt` and `hover:bg-surface-hover`.

## Components and design

Use the shared kit in `client/src/components/ui/` and the templates in `client/src/components/templates/` (list in `../../DESIGN.md`). Page buttons on Apps, Groups, Roles and Teams still read the legacy `userRole` from `GET /auth/me`; the server enforces the highest-ranked `UserRole` assignment (see `STATUS.md`).

Copy rules: say what happened, why, and what to do next; no marketing text; destructive actions go through `ConfirmDialog` (typed confirmation for the irreversible ones).
