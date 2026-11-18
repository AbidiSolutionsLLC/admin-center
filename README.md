# Karbexa Admin

The administration centre of the Karbexa platform, and its sign-in service.

| Part | Folder | What it does |
|---|---|---|
| **Admin API** | `server/` | Tenant administration (`/api/v1`): members, groups, departments, locations, policies, App Access, audit |
| **Identity provider** | `server/src/identity/` | OpenID Connect sign-in for every Karbexa app. Realms `tenant`, `operator`, `services`; password + TOTP; Microsoft Entra federation |
| **Operator API** | `server/src/operator/` | `/operator/v1`, for Karbexa staff: provision organisations, plans, entitlements |
| **Platform API + events** | `server/src/platform/`, `server/src/lib/platformEvents.ts` | `/platform/v1` and the event feed the products backend consumes |
| **Admin web app** | `client/` | React app for org admins, plus the operator console at `/operator` |

Stack: Node 22, Express 5, TypeScript, Mongoose 9, `oidc-provider` 9 · React 19, Vite, Tailwind, TanStack Query, shadcn/ui.

## Run it

The whole platform starts with one command from the platform root: see `../docs/LOCAL-DEVELOPMENT.md`. To run only this repo, with a MongoDB replica set already running and `server/.env` filled in (`server/.env.example`; reference in `docs/CONFIGURATION.md`):

```bash
cd server && npm ci && npm run seed:products && npm run seed:operator && npm run dev   # http://admin.karbexa.localhost:5000
cd client && npm ci && npm run dev                                                     # http://admin.karbexa.localhost:5173
```

## Scripts

| Folder | Script | Does |
|---|---|---|
| server | `dev` / `build` / `start` | Watch mode / compile to `dist/` / run `dist/index.js` (production) |
| server | `typecheck` | `tsc --noEmit` |
| server | `test` | Unit and integration tests (`src/**/__tests__/*.test.ts`, in-memory MongoDB) |
| server | `smoke:login` | End-to-end sign-in, MFA, refresh and logout against an in-memory server (68 checks on 2026-11-17) |
| server | `smoke:sprint2` | End-to-end Admin, operator, platform API and events (554 to 581 checks, 5 to 15 min) |
| server | `seed:products` / `seed:operator` / `seed:demo` | Product registry and role catalogs / first operator account (idempotent) / the "Acme Demo" organisation through the real API (`-- --memory` self-check) |
| server | `perf:lists` / `walk:server` | List endpoints at 5,000 tenants / real-stack server for `client/e2e-real/walk.mjs` |
| server | `gen:admin-backend-key` | Key for the `karbexa-admin-backend` service client |
| server | `seed:e11`, `send:claims`, `migrate:identities` | **Legacy migration tools, not used** (go-live is a fresh start) |
| client | `dev` / `build` / `lint` / `typecheck` | Vite dev server / type-check + production build / ESLint / `tsc -b` |

Run the smokes with `SMTP_HOST=127.0.0.1 SMTP_PORT=1` so no e-mail leaves the machine.

## Documentation

| File | Contents |
|---|---|
| `AGENTS.md` | Conventions and rules for developers and AI agents. **Read before changing code.** |
| `docs/ARCHITECTURE.md` | The repo as a whole: processes, folder map, request pipeline, transactions, audit, events |
| `docs/CONFIGURATION.md` | Every environment variable |
| `docs/identity/README.md` | Sign-in, tokens, realms, MFA, sessions |
| `docs/admin-center/README.md` | Tenant administration: members, structure, roles, App Access, security, audit |
| `docs/command-center/README.md` | Operator console: organisations, plans, entitlements, onboarding, health, operators |
| `docs/platform-api/README.md` | `/platform/v1` and the event feed |
| `DESIGN.md` | Design tokens, Admin UI rules (dark theme) and how to add a page |
| `CHANGELOG.md` | Notable changes |
| `../docs/` | Platform docs: status, glossary, database, deployment, decisions |
| Git tag `docs-before-standard` | Where the older planning documents and per-portal references live (`git show docs-before-standard:docs/archive/...`) |

Each of the four product folders under `docs/` has the same nine files (README, PRD, ARCHITECTURE, DATA-MODEL, API, ACCESS, UI, STATUS, DECISIONS); the standard is the meta repo `docs/DOC-STANDARD.md`.
