# AGENTS.md: karbexa-admin

Read `../AGENTS.md` (platform rules) and `../docs/STATUS.md` first. This file covers this repo only.

## Where things are

| Need | Location |
|---|---|
| App bootstrap, middleware order, route mounting | `server/src/app.ts`, `server/src/index.ts`, `server/src/routes/index.ts` |
| Tenant API routes → controllers | `server/src/routes/*.routes.ts` → `server/src/controllers/*.controller.ts` |
| Models | `server/src/models/*.model.ts` (exported from `models/index.ts`) |
| Sign-in (OIDC provider, hosted pages, MFA, sessions, keys) | `server/src/identity/` (`providers.ts`, `interactions.ts`, `html.ts`, `sessions.ts`, `keys.ts`) |
| Operator realm and API | `server/src/operator/` |
| Platform API for the products backend | `server/src/platform/` |
| App Access, effective access, role catalogs | `server/src/lib/effectiveAccess.ts`, `server/src/lib/productCatalog.ts` |
| Transactions, audit, platform events | `server/src/lib/platformEvents.ts` (`runInTransaction`, `emitPlatformEvent`), `server/src/lib/auditLogger.ts` (`logTx`), `server/src/lib/lifecycle.ts` |
| Event delivery to products | `server/src/lib/platformDispatcher.ts`, `lib/ssrfGuard.ts`, `lib/platformLease.ts` |
| Org roles and permission groups | `server/src/constants/roles.ts`, `server/src/middleware/requireRole.ts` |
| Web app routes | `client/src/App.tsx`, `client/src/constants/routes.ts` |
| Web app pages / feature modules | `client/src/pages/*`, `client/src/features/*` (hooks + components per area) |
| API client, auth, session | `client/src/lib/apiClient.ts`, `client/src/lib/oidc.ts`, `client/src/lib/session.ts` |
| Operator console | `client/src/features/operator/` |

Full detail: `docs/ARCHITECTURE.md` (the repo as a whole) and the product folders below.

## To change X, read

| To change | Read first (in `docs/<key>/`) |
|---|---|
| Sign-in, tokens, realms, MFA, sessions, Entra, hosted pages | `identity/README.md`, then `ARCHITECTURE.md`, `ACCESS.md` |
| Members, org structure, roles, App Access, security settings, audit, any tenant `/api/v1` page or endpoint | `admin-center/README.md`, `STATUS.md`, the PRD entry; `ACCESS.md` and `DATA-MODEL.md` before a query; `API.md` before an endpoint; `UI.md` before a page |
| Operator console: organisations, plans, entitlements, onboarding, health, operators, audit | `command-center/README.md` and the same files |
| `/platform/v1`, the event feed, manifests, role catalogs | `platform-api/README.md`; contract in the meta repo `docs/architecture/05`, `06` |
| An environment variable | `docs/CONFIGURATION.md` |
| The look of a page | `DESIGN.md` |

The standard every folder follows: the meta repo `docs/DOC-STANDARD.md` (nine files per folder: README, PRD, ARCHITECTURE, DATA-MODEL, API, ACCESS, UI, STATUS, DECISIONS).

## Conventions (follow the existing code)

- **Routes:** each router starts with `router.use(requireAuth)`. Admin-only actions add `requireRole(PERMISSION_GROUPS.…)`. Register static path segments before `/:id` routes.
- **Controllers:** wrap handlers in `asyncHandler`. Throw `new AppError(message, status, CODE)`; `middleware/errorHandler.ts` turns it into `{ success: false, error, code }`. Successful responses are `{ success: true, data }`.
- **Validation:** zod schemas at the controller boundary.
- **Tenant scoping:** every query filters on `company_id: req.user.company_id`. Look up by `_id` **and** `company_id`, never by `_id` alone. `npm test` first runs `scripts/tenant-scope-gate.cjs`, which fails on a new unscoped call on a tenant model; a call that is safe on purpose gets `// tenant-scope-ok: <reason>`. A filter variable counts as scoped when it is declared just above as an object literal with `company_id` (`const filter = { company_id: req.user.company_id, … }`).
- **Changes that affect access or members:** do the domain write, `auditLogger.logTx(session, …)` and `emitPlatformEvent(session, …)` inside one `runInTransaction`. Bump `authz_ver` when effective access changes (`bumpAuthzVer`). Post-commit work goes in `onCommit` hooks. Copy an existing transactional controller (`groups.controller.ts`) rather than inventing a pattern.
- **Event and Platform API shapes are contracts** (`../docs/architecture/05`, `06`). Changes must be additive and recorded in `../docs/DECISIONS.md` first.
- **Hosted pages** (`identity/html.ts`): server-rendered, inline CSS with a per-response CSP nonce, no external assets. The skin comes from `shellForClient`.
- **Web app:** TanStack Query hooks live in `features/<area>/hooks`; colours come from Tailwind theme tokens (`primary`, `ink`, `line`, `surface`), never new hex values (`DESIGN.md`).

## Commands

```bash
cd server && npm run typecheck && npm test        # every change
cd server && SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:login     # identity changes
cd server && SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2   # admin/operator/platform changes (10–15 min)
cd client && npm run build                        # every web change

# One test file (per-task Tier 1, decision D1); verified 2026-11-25 with errorHandlerBody.test.ts
cd server && node --require ts-node/register/transpile-only --test src/middleware/__tests__/errorHandlerBody.test.ts
cd client && npx playwright test e2e/admin-navigation.spec.ts   # one browser spec (PLAYWRIGHT_BROWSERS_PATH, see ../docs/STATUS.md)
```
Expected results: `../docs/STATUS.md` → "Test baseline". Tests use in-memory MongoDB; if drive C: is low, set `TEMP`/`TMP` to another drive.

## Never

- Never weaken the production guards: `TRUST_PROXY` required, operator IP allow-list fails closed, `MOCK_EMAIL` / `EXPOSE_INVITE_TOKEN` / `ALLOW_STANDALONE_MONGO` ignored in production.
- Never return secrets or password hashes from an API (`/auth/me` uses an allow-list).
- Never commit `.env`, `.local/` or keys.
- Never use `seed:e11` / `send:claims` for go-live (fresh-start decision).

## After a change
Update the matching files of the product folder (`PRD`, `API`, `DATA-MODEL`, `ACCESS`, `UI`, `STATUS`, and `DECISIONS` for a non-obvious choice), `docs/CONFIGURATION.md` (if env vars changed), `../docs/STATUS.md` and `CHANGELOG.md` in the same commit. A doc that disagrees with the code is reported in `STATUS.md` (Known issues), not silently fixed.
