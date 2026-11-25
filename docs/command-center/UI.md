# Command Center: what the user sees

Design language: `../../DESIGN.md` (same dark theme as the Admin Center; the operator shell adds a red "Operator" marker from the `error` token and has no launcher or notifications). Operator sign-in pages: `../identity/UI.md`.

## Routes and navigation

All pages except the callback and the accept-invite page sit inside `OperatorGuard` (no token in memory: refresh if a refresh token exists, else redirect to the operator realm) and `OperatorShell` (`AppShell` with `OPERATOR_SHELL`). Navigation items (Overview, Organizations, Onboarding, Plans, Products, Platform health, Operators, Audit, Security) are shown only when `GET /me` lists their permission (`tenants.read`, `overview.read`, `products.read`, `health.read`, `operators.read`, `audit.read`, `security.read`); the API enforces independently.

| Route | Component | Purpose, data and actions |
|---|---|---|
| `/operator/callback` | `pages/operator/OperatorCallbackPage.tsx` | Code exchange (`completeOperatorLogin`), then the saved `return_to` or `/operator/organizations` |
| `/operator/accept-invite` | `pages/operator/OperatorAcceptInvitePage.tsx` | Public. `POST /invite/verify` on load, then a password form (`POST /invite/accept`) or one notice (not found, expired, superseded, revoked, already used). TOTP is enrolled at first sign-in |
| `/operator` | redirect | To `/operator/overview` |
| `/operator/overview` | `OperatorOverviewPage.tsx` (`DashboardPage`) | `GET /overview`: tiles, Attention required (top 10 with link), platform health, recent activity; Announcement dialog (publish, replace, end; `announcements.write`). Each section fails on its own |
| `/operator/organizations` | `OperatorOrgsPage.tsx` (`ListPage`) | `GET /orgs`: search, status, plan, tag, in-trial filters and sort in the URL; create organisation (`CreateOrgDialog.tsx`, three steps); suspend, reactivate, close. A row opens the tenant page |
| `/operator/organizations/:id` | `OperatorTenantPage.tsx` (`ObjectPage`) | Tabs (`?tab=`): Summary (tags, trial, identity providers with Entra tenant approval), Products (override, remove override, change plan with preview, seat meter), Onboarding, Admins, Activity, Notes |
| `/operator/onboarding` | `OperatorOnboardingPage.tsx` (`ListPage`) | `GET /onboarding`: stage, first admin, invitation sent and expiry, last delivery error, Resend invitation; stage filter in the URL |
| `/operator/products` | `OperatorProductsPage.tsx` (`ListPage`) | Read-only catalogue: status, category, manifest version, roles, tenants active, suspended, restricted |
| `/operator/health` | `OperatorHealthPage.tsx` (`DashboardPage`) | `GET /health`, `/health/sync`: overall pill, counts, a card per component, recent state changes, products sync by organisation; polls every 30 s |
| `/operator/plans` | `OperatorPlansPage.tsx` (`ListPage`) | `GET /plans`: organisations on each, trial, version; create, edit (products are chosen as checkboxes from the registered catalogue, `GET /products`); apply to organisations with a dry-run preview |
| `/operator/operators` | `OperatorOperatorsPage.tsx` | `GET /operators`: list with role, invite, edit, suspend (confirmed first), sessions with revoke |
| `/operator/audit` | `OperatorAuditPage.tsx` (`ListPage` and `Drawer`) | `GET /audit`: category, operator, date and action filters, detail drawer (before, after, reason), cursor paging, Export CSV |
| `/operator/security` | `OperatorSecurityPage.tsx` (`DashboardPage`) | `GET /security`: counts, operators without MFA, locked accounts, active sessions with Revoke, failed sign-ins, role changes, organisations whose admins have no MFA |

## The four states

`ListPage` and `DashboardPage` sections show loading (`TableSkeleton` or section skeleton), empty (`EmptyState`), error (`ErrorState`; a failing dashboard section is `{ error: true }` from the API and shows its own error) and, where a control needs a permission the operator lacks, the control is hidden. Destructive confirmations use `ConfirmDialog` with `requireText` (slug typed back) and `reasonField`.

## Components

`PageHeader`, `Toolbar`, `StatTile`, `KeyFacts`, `SeatMeter`, `HealthPill`, `Tag`, `Tabs`, `Drawer`, `SectionBoundary`, `DataTable`, `ConfirmDialog`, `StatusBadge` from `client/src/components/ui/`; templates from `client/src/components/templates/`. Tokens and rules: `../../DESIGN.md`. Copy rules: say what happened and what to do next; reasons are mandatory wording on suspend, close and override.

Operator tokens (including the refresh token) are kept in memory only, so a reload goes back through the operator realm.
