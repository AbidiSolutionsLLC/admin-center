# PROGRESS-WS-D (karbexa-admin, branch ws/ws-d)

Workstream D: suite module loader and the Knowledge Base slot (`docs/EXECUTION-PLAN.md` §6 WS-D). This repo: registry seed and client allow-list only. Deleted in Wave 2.

## Tasks
| Id | State | Notes |
|---|---|---|
| D-3 | done | `server/src/lib/productCatalog.ts`: `kb` in `PRODUCT_DEFS` (roles per G4, `kb_reader` default, `default_assignments: []`, category `work`, path `/kb`, env `KB_LAUNCH_URL`); not in `DEFAULT_PLANS`. `server/src/identity/config.ts`: default `PLATFORM_CLIENT_PRODUCTS` allow-list of `karbexa-products-backend` includes `kb`. Server typecheck clean |

## Needs from others
- **WS-A (owns `server/src/scripts/smoke-sprint2.ts`):** the check `E3 registry seeds people/projects/sign/desk` (line ~81) compares the seeded keys with `'desk,people,projects,sign'`; after D-3 the seed also writes `kb`, so the expected string is `'desk,kb,people,projects,sign'`. The L3-1 loop (read_only rank 5, one default) could add `kb: 'kb_reader'`.
- **WS-F (docs):** `docs/CONFIGURATION.md`: new optional `KB_LAUNCH_URL` (launch URL of the kb tile; default `PRODUCTS_SPA_ORIGIN` + `/kb`). Admin portal docs: `kb` is a built-in product, assignable in App Access, not in any default plan.
- **Decision record (meta `docs/DECISIONS.md`):** `kb` joins the built-in seed and the default services-client allow-list (G4 covers the roles; no contract shape changes).

## Found while working
- `server/src/scripts/seed-e11.ts` iterates `PRODUCT_DEFS`, so it now seeds `kb` too (harmless; `seed:e11` is not for go-live).

## Tests written, not run
| File | Covers |
|---|---|
| `server/src/lib/__tests__/kbProduct.test.ts` (new) | kb roles/ranks/default, no default rule, in no default plan, allow-list default includes kb and env override still wins |
| `server/src/lib/__tests__/productLaunchUrl.test.ts` (updated) | default launch URL map now includes `kb: …/kb` |
