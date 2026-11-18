# PROGRESS-WS-F (documentation, Admin repo)

Branch `ws/ws-f` of `karbexa-admin`. Tag `docs-before-standard` created locally on `main` (4435d81); not pushed.

## Tasks

| Task | State |
|---|---|
| F-1 docs/identity (9 files) | done |
| F-2 docs/admin-center (9 files) | done |
| F-3 docs/command-center (9 files) | done |
| F-4 docs/platform-api (9 files) | done |
| F-5 repo level: AGENTS.md, README.md, CHANGELOG.md format, DESIGN.md (tokens folded in, per WS-H request), docs/ARCHITECTURE.md, docs/CONFIGURATION.md, delete docs/archive, docs/portals, client/README.md | not started |

## Needs from others

- Meta repo (WS-H / integrator): `docs/STATUS.md`, `AGENTS.md` and other meta files link to `karbexa-admin/docs/portals/*.md`; those files are deleted here, the new homes are `docs/identity`, `docs/admin-center`, `docs/command-center`, `docs/platform-api`.
- Meta repo: `docs/DESIGN.md` can be deleted in Wave 2; Admin `DESIGN.md` now holds the token table and no longer links to it.

## Found while working

- Old `docs/portals/admin.md` listed two routes as unreachable (`GET /work-schedules/assignments`, `DELETE /holidays/assignments/bulk`); the code on `main` registers the static routes first and `routes/__tests__/routeOrder.test.ts` covers it. Fixed in the new docs.
- Old `docs/portals/operator.md` said the Entra tenant approval has no UI; the code has it (`useOrgIdps` and the approve mutation in `client/src/features/operator/operatorApi.ts`).
- Old docs said a `companyName` is never set in the auth store; no such reference exists any more.

## Tests written, not run

None (documentation only).
