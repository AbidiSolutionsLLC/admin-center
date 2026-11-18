# Admin Center: status

Last verified: 2026-11-18 against `main` of `karbexa-admin` (4435d81). Results below are the last real runs (Phase 7, 2026-11-17, on `feat/elevation`, and the demo-fixes runs of the same day); nothing was run for this document. Platform roll-up: meta repo `docs/STATUS.md`.

## Built, by feature ID

| IDs | State | Proven by |
|---|---|---|
| ADM-001 to ADM-014, ADM-016 to ADM-019, ADM-021 | built | `smoke:sprint2` 554/554 (2026-11-17; 567 expected on `main` after the paging follow-up), Admin unit tests 199/199, Playwright specs for every page (all passed 2026-11-17 on `feat/elevation`), real-stack walk: all 23 Admin Center pages load clean |
| ADM-015 | partial | Server stream built; no client consumer |
| ADM-020 | partial | See known issues |
| ADM-025 | partial | `seed:demo` written on `main`; never run (WS-A A-1) |
| ADM-022, ADM-023, ADM-024, ADM-026, ADM-027, ADM-028 | planned | See backlog |

## Known issues

| Issue | Where | Impact |
|---|---|---|
| `GET /people` is paged (default 50, cursor), but the People page and the user pickers still read every page (`useUsers`), so a very large organisation loads slowly there. One page costs about 0.35 to 0.75 s at 5,000 members; each member on a page still costs about one extra query (integrity check). `?search=` is an unanchored regex (about 1.3 s at 5,000) | `server/src/controllers/people.controller.ts` `getUsers`; `client/src/pages/people/PeoplePage.tsx`, `client/src/features/people/hooks/useUsers.ts` | Moving the People page to server-side paging and filters is a separate client task (ADM-023) |
| Page buttons on Apps, Groups, Roles and Teams check the legacy `User.role` returned by `GET /auth/me`; the server enforces the highest-ranked `UserRole` assignment. The menu follows permissions and server role lists, so an item can still show for a role the server then rejects in a few cases | `client/src/lib/session.ts`, `auth.controller.ts` `getMe` | Controls shown or hidden differently from what the server allows |
| About 600 off-theme class uses remain in `client/src/features/*` (people, security, overview, organisation); only page files were restyled | `client/src/features/*` | Visual inconsistency |
| `Combobox` and `DatePicker` (design kit) were not built; no screen needs them yet | `client/src/components/ui/` | None |
| The top-bar search box has no handler | `client/src/components/layout/TenantTopActions.tsx` | Cosmetic |
| `useUrlParam` builds each update from the router's render-time snapshot, so two filter changes in the same frame can drop the first (a user cannot normally trigger it) | `client/src/hooks/useUrlParam.ts` | Test flake only |
| The Audit action filter sends a request per keystroke (exact match, URL-held); add a debounce if noisy | `client/src/pages/audit-logs/AuditLogsPage.tsx` | Load |
| The `App` slug index (`partialFilterExpression` with `$exists: false`) cannot be built by MongoDB; Mongoose logs it at start-up | `server/src/models/App.model.ts` | Uniqueness of system app slugs is not enforced by an index |
| Policies, workflows, data fields, integrations, IP restrictions and identity providers do not use `runInTransaction` and emit no platform events | `server/src/controllers/` | Products are not told about these changes (none of them is consumed today) |
| Login-time IP restriction evaluation uses the member's first `UserRole`; `requireAuth` uses the highest-ranked role | `auth.controller.ts` `evaluateLoginIpPolicy`, `middleware/auth.ts` | Inconsistent rule in edge cases |
| Debug leftovers: `console.log('ROLES ROUTES LOADED')` and `GET /api/v1/protected-test` | `server/src/routes/roles.routes.ts`, `routes/index.ts` | Noise; the route returns `req.user` to any signed-in member |
| `CastError` on `_id` is reported as "User not found" for every model | `server/src/middleware/errorHandler.ts` | Misleading message |
| `/security/sessions` took 0.7 to 1.2 s with 101 sessions examined (Phase 7.4) | `security.controller.ts` | Slow at scale |
| 7.2 low findings on the public invitation routes (verify limiter, renew timing, old link supersedes current) | `people.controller.ts` | Planned: WS-A A-3, A-4, A-5 |
| Entra JIT member creation is not built; first-sign-in linking works for existing members | `../identity/STATUS.md` | Unknown Microsoft users are denied |
| Audit export: the routes require Super Admin or IT Admin and IT Admin holds audit read only, so in practice only Super Admin exports | `auditLogs.routes.ts`, `lib/seed.ts` | Narrower than the seeded permissions (decision G9) |

Resolved since the old notes (kept so nobody re-reports them): Security active sessions (5.2), audit and holiday exports for built-in roles (5.3), `member.updated` for active, probation and on_leave (5.11), two unreachable routes (`GET /work-schedules/assignments`, `DELETE /holidays/assignments/bulk`, covered by `routeOrder.test.ts`), account page access states (0.7g), seat enforcement.

## Backlog (priority order)

| Task | What |
|---|---|
| WS-A A-1 | Finish and run `seed:demo --memory` (ADM-025) |
| WS-A A-3, A-4, A-5 | Invitation route hardening (ADM-026) |
| WS-C C-6 | Standalone portals in the Admin launcher (ADM-024) |
| none | People page server-side paging (ADM-023); External members (ADM-022); feature components restyle; E8 event-driven calendars; E9 audit hash chain |

## Test commands and last results

| Gate | Command | Last real result |
|---|---|---|
| Typecheck | `server`: `npm run typecheck` | 0 errors (2026-11-17) |
| Unit | `server`: `npm test` | 199 pass (2026-11-17) |
| Sign-in smoke | `server`: `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:login` | 68/68 (2026-11-17) |
| Full smoke | `server`: `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2` | 554/554 on `feat/elevation`; 581/581 on `feat/demo-fixes` (2026-11-17) |
| Web build | `client`: `npm run build` | green (2026-11-17) |
| Browser specs | `client`: `npx playwright test` | all pass on `feat/elevation` (2026-11-17). The runs on `feat/demo-fixes` that day are void (overlapping runs, wrong browsers folder); C1 `admin-navigation.spec.ts` case not run |
| Real-stack walk | `server`: `npm run walk:server`; `client`: `node e2e-real/walk.mjs` | 34/34 pages clean, 23 of them Admin Center (2026-11-17) |
| List endpoints at scale | `server`: `npm run perf:lists` | 61 of 69 calls under 300 ms at 5,000 tenants and 50,000 members; the slow ones are listed above and in `../command-center/STATUS.md` |
