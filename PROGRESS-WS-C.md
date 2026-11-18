# PROGRESS WS-C: standalone portal support

Branch `ws/ws-c` (Admin) and `ws/ws-c` (products, C-6 only). Spec: meta `docs/spec/02-MASTER-DRD.md` §8, PRD §4.4.
Deleted in Wave 2 after the integrator folds it into the docs.

## Tasks

| Id | State | Notes |
|---|---|---|
| C-1 | done | Routes in `operator/standalone.ts`: GET list, GET one, PUT register/update, POST rotate-secret, PUT per-tenant launch-url. Server typecheck clean. |
| C-2 | not started | |
| C-3 | not started | |
| C-4 | not started | |
| C-5 | not started | |
| C-6 | not started | |
| C-7 | not started | |

## Needs from others

- `operator/permissions.ts` (not owned by WS-C) has no `products.write` permission. `requireProductsWrite` in `operator/standalone.ts` accepts the permission or the role `platform_admin`, so registration works now; whoever owns `permissions.ts` should add `products.write` to `ROLE_PERMISSIONS.platform_admin` (the fallback then becomes redundant, not wrong).

## Found while working

- The first registration of a confidential client returns `client_secret` once (HTTP 201, `Cache-Control: no-store`); later PUTs never return it. Rotation returns the new secret once.

## Decisions to record

## Tests written, not run

- C-1: `server/src/lib/__tests__/standalonePortals.test.ts` (validation, client id, auth methods, secret generation, no secret in the view).
