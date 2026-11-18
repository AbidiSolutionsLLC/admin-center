# PROGRESS-WS-A (Admin demo readiness)

Branch `ws/ws-a` (Admin and meta repo). Meta repo part: `scripts/dev.mjs` only.

| Task | State | Commit | Notes |
|---|---|---|---|
| A-1 | done | df27483 and the launchTimeout commit | seed:demo reads product apps in one page (`GET /apps?type=karbexa_product&limit=100`); mongod launchTimeout 90 s in `--memory` mode. Self-check passed, see "A-1 seed run" below |
| A-2 | done | 3b78fc4 (meta repo) | `node scripts/dev.mjs --demo`; `node --check` clean |
| A-3 | done | 7d41881 | `verifyInviteLimiter` (30 per 15 min per IP, 429 `RATE_LIMITED`) in `middleware/rateLimiter.ts`; `verifyInviteToken` is now `[limiter, handler]` |
| A-4 | done | 0bb2999 | `renew-invite` sends 202 first; renewal and outbox row commit in one transaction, delivery after commit |
| A-5 | done | 5ba4425 | renews only the user's newest invitation, once expired and still pending |
| A-6 | done | see git log | `POST /operator/v1/operators` removed; client "Add with password" button, modal and create path removed; `useSaveOperator` is update-only |

## A-1 seed run
- Run 1 (2026-11-18, machine at 84% memory): failed before any seeding, `MongoMemoryReplSet` did not start within the default 10 s (`GenericMMSError`). Environment, not code.
- Fix: `instanceOpts: [{ launchTimeout: 90000 }]` in `seed-demo.ts` (`--memory` branch only).
- Run 2: exit 0. Output: `--memory check: 16 active members, 12 app assignments, 66 platform events`. One non-fatal warning: `people/employee -> group:All Members` answered 409 `ASSIGNMENT_EXISTS` (the product default rule already assigns it); the seed tolerates it. After the check, background jobs log `MongoClientClosedError` at shutdown; harmless.
- `HEAVY-RUN.lock` was created before each run and removed after it.

## Needs from others
- Docs (WS-F/H, integrator): `docs/spec/03-IMPLEMENTATION-PLAN.md` 7.2 findings 1, 2, 3 and 5 are now closed (A-3 to A-6); finding 4 was closed earlier (C7). Admin `docs/command-center` API list must drop `POST /operator/v1/operators`.

- WS-D coordination: smoke-sprint2 E3 registry check and the L3-1 loop now expect `kb` (`kb_reader`); valid only after ws/ws-d (productCatalog.ts, commit c8803b3) is merged. Until then that smoke case fails on this branch alone.

## Found while working
- A-3 changes the export shape of `verifyInviteToken` (a handler array, mounted by `router.post(..., verifyInviteToken)`; Express accepts both). Anything that calls it directly as a function would break; none found in `server/src`.
- Unmatched operator routes fall through to Express's default 404 (HTML "Cannot POST ..."), not the JSON envelope; the smoke case checks only the status.

## Tests written, not run
- A-3: `smoke-oidc-login.ts` (30 normal answers, 31st = 429 `RATE_LIMITED`, real token also 429 over the limit)
- A-4: `smoke-oidc-login.ts` (real expired link writes one outbox row; unknown token same 202 body and no row; timing bound)
- A-5: `smoke-oidc-login.ts` (old superseded link: 202, current invitation stays pending, no e-mail, current link still verifies)
- A-6: `smoke-sprint2.ts` (direct `POST /operators` = 404 for platform_admin and creates nothing; the 4.1 support check now targets `/operators/invite` = 403)
- The route-coverage unit test is unchanged and must still pass (the removed route had a `requirePermission` mark; no `publicRoute` entries changed).
