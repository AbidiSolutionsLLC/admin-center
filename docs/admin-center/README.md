# Admin Center (tenant administration)

The customer-facing administration web app and its API (`/api/v1`). Organisation admins invite and manage members, structure the organisation (departments, teams, locations, calendars), define org roles, decide which Karbexa product each member gets and in which role (App Access), set security policy, and read the audit log. Operators provision organisations and plans in the Command Center (`../command-center/`); sign-in is in `../identity/`; the API products consume is in `../platform-api/`.

## Users and roles

| Who | What they can do here |
|---|---|
| Super Admin | Everything, including deleting groups and roles, company settings, audit log |
| HR Admin, HR, Admin | Members and lifecycle (`PEOPLE_ADMINS`); Admin also IT and Ops areas |
| IT Admin | App Access, sessions, MFA reset, IP rules, identity providers, audit log |
| Ops Admin | Locations, calendars, schedules, policies, workflows, data fields |
| Manager, Employee | Read access to lists; the launcher; approvals assigned to them |

The full matrix is `ACCESS.md`. Product roles (People, Projects, Sign, Desk, `read_only`) are assigned here and enforced in the products.

## Code map

| Folder | What lives there |
|---|---|
| `server/src/routes/*.routes.ts`, `routes/index.ts` | One router per area, mounted at `/api/v1` |
| `server/src/controllers/*.controller.ts` | Handlers (`people`, `organization`, `groups`, `roles`, `apps`, `appAccess`, `security`, `auditLogs`, `company`, `locations`, `holidays`, `workSchedules`, `policies`, `workflows`, ...) |
| `server/src/models/*.model.ts` | Mongoose models, exported from `models/index.ts` |
| `server/src/middleware/auth.ts`, `requireRole.ts` | `requireAuth`, `requireRole` |
| `server/src/constants/roles.ts`, `server/src/lib/roleHierarchy.ts`, `rbac.ts` | Role names, guard groups, grant hierarchy, granular permissions |
| `server/src/lib/effectiveAccess.ts`, `productCatalog.ts`, `productRegistry.ts`, `seats.ts` | App Access, product registry, seat counting |
| `server/src/lib/platformEvents.ts`, `auditLogger.ts` | Transaction, audit and event helpers |
| `server/src/lib/invitations.ts`, `emailService.ts` | Invitations and the e-mail outbox |
| `client/src/pages/<area>/` | Route components |
| `client/src/features/<area>/` | Hooks and components per area |
| `client/src/components/layout/`, `ui/`, `templates/` | Shell, navigation, shared kit, page templates |
| `client/e2e/admin-*.spec.ts`, `activation.spec.ts`, `invitation-panel.spec.ts` | Playwright specs (API mocked) |

## Run it locally

Whole platform: `node scripts/dev.mjs` from the workspace root (`docs/LOCAL-DEVELOPMENT.md` in the meta repo). Admin only:

```bash
cd server && npm ci && npm run seed:products && npm run seed:operator && npm run dev   # http://admin.karbexa.localhost:5000
cd client && npm ci && npm run dev                                                     # http://admin.karbexa.localhost:5173
```

Demo data: `cd server && npm run seed:demo` (written, never run; see `STATUS.md`).

Tests: `cd server && npm run typecheck && npm test`; `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2` (Admin, operator and platform end to end); `smoke:login`; `cd client && npm run build` and `npx playwright test`; real-stack walk `npm run walk:server` with `node client/e2e-real/walk.mjs`. Expected results: `STATUS.md`.

## Non-negotiable rules

- Every query is scoped by `company_id`; look records up by `_id` **and** `company_id`, never by `_id` alone.
- Admin owns identity, membership, organisation structure and access. Products never write these; they receive them through events.
- A change that affects access or members does the write, the audit row and the event in one `runInTransaction`, and bumps `authz_ver` when effective access changes.
- Event, Platform API, token and manifest shapes change only additively, after a recorded decision (meta `docs/DECISIONS.md`).
- Every router starts with `router.use(requireAuth)`; write routes add `requireRole(PERMISSION_GROUPS.X)`. Static path segments are registered before `/:id`.
- Server guards are not widened to match the seeded permissions (decision G9); the menu mirrors the server.
- Colours come from theme tokens, never new hex values.
- Never return secrets or password hashes from an API; never commit `.env` or keys (this repo is public).

## The other files

[PRD](PRD.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA-MODEL](DATA-MODEL.md) · [API](API.md) · [ACCESS](ACCESS.md) · [UI](UI.md) · [STATUS](STATUS.md) · [DECISIONS](DECISIONS.md). Repo level: `../ARCHITECTURE.md`, `../CONFIGURATION.md`, `../../DESIGN.md`.
