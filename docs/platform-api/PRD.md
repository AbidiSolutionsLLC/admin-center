# Platform API: product requirements

Source of truth for what products and portals can rely on. State is read from the code and `STATUS.md` (2026-11-18). Spec ref: meta repo `docs/spec/02-MASTER-DRD.md` (meta repo tag `docs-before-standard`) sections 1, 2 and 8 and `docs/architecture/05`, `06`. Features are never deleted, only marked `dropped` with a date.

## Consumers

| Consumer | Needs |
|---|---|
| Products backend | Members, access, structure, calendars, revocations, and an ordered change feed it can resync from |
| Standalone portal (Assets, Zyntrus) | Registration as a product, sign-in claims, launcher entry, health check |
| Admin itself | Open items of a member from the products backend (outbound) |
| Developer adding a product | Publish a manifest and a role catalog without an Admin deploy |

## Features

| ID | Feature | Priority | State | Acceptance criteria |
|---|---|---|---|---|
| PLT-001 | Service-token authentication: services realm, audience `urn:karbexa:platform-api`, token age at most 15 min, client allow-list, scopes per route | Must | built | `smoke:sprint2` E4 block; 401 `NO_TOKEN`, `INVALID_TOKEN`; 403 `INSUFFICIENT_SCOPE` |
| PLT-002 | Read endpoints: organisations, one organisation, members (paged, `updated_since`), one member, departments, locations | Must | built | `smoke:sprint2` E4 block |
| PLT-003 | Effective product access of a member (`authz_ver`, role per product), `no-store` | Must | built | `smoke:sprint2` E3 block |
| PLT-004 | Effective calendars (holidays and work schedule) for a member or a location | Should | partial | Built; only assignments targeting the resolved location itself are used, parent locations are not walked |
| PLT-005 | Per-organisation ordered event feed with `after_seq` paging, cursor errors and 30-day retention | Must | built | 409 `CURSOR_AHEAD`, 410 `CURSOR_EXPIRED`; `smoke:sprint2` E4, E4a |
| PLT-006 | Signed nudges to subscribers with backoff, re-nudge until acknowledged, one dispatching instance, SSRF protection | Must | built | `platformDispatcher.test.ts`, `ssrfGuard.test.ts`; delivery p95 about 0.6 s (target 5 s) in `test:e2e-platform` |
| PLT-007 | Session revocation feed (`/sessions/revocations`) | Must | built | Session revocation about 0.4 s end to end (target 30 s). `realm=operator` is always empty |
| PLT-008 | Role catalog write with version lock, `ROLE_IN_USE` protection and access fan-out | Must | built | `smoke:sprint2` E4d block |
| PLT-009 | Manifest publish (registers or updates a product) and `GET /apps` | Must | built | `smoke:sprint2` 1.3 block: new product, stale version, `ROLE_IN_USE`, client not allowed |
| PLT-010 | Per-client rate limit and auth-failure throttle on a shared MongoDB store | Must | built | `rateLimit.test.ts`; `PLATFORM_RATE_LIMIT_PER_MIN=1` case in `smoke:sprint2` |
| PLT-011 | Outbound: Admin token for the products internal API; open-items proxy for offboarding (503 `PRODUCTS_UNAVAILABLE` on failure) | Should | built | `openItemsProxy.test.ts`; `smoke:sprint2` L3-4 |
| PLT-012 | Manifest `capabilities` (seats, offboarding) stored | Could | partial | Validated, not stored |
| PLT-013 | Standalone products in `GET /apps` and in launcher listings with absolute URLs; registration with `hosting.mode: 'standalone'` | Must for Assets and Zyntrus | built (W3-2a, decision W2-LAUNCH, contract 1.1.0): registration (operator route, WS-C C-1); `GET /platform/v1/apps` reports the real standalone `hosting` block; `GET /platform/v1/orgs/:orgId/launchers` lists the standalone portals of an organisation; tests written (smoke `W2-LAUNCH` cases, unit), not yet run | Spec: DRD section 8 (meta tag `docs-before-standard`) |
| PLT-014 | Knowledge Base registered as a suite product (`kb`, roles `kb_administrator`, `kb_reviewer`, `kb_author`, `kb_reader`, `read_only`) | Must for Knowledge Base | built (WS-D D-3; decision KB-1): in the built-in seed and the default `PLATFORM_CLIENT_PRODUCTS` allow-list, in no default plan; tests written, not run | Manifest publish from the products backend |
| PLT-015 | Service tokens bound to an organisation or product scope | Could | planned (no task id) | Today any client with the scope reads any organisation |
| PLT-016 | `GET /orgs` paged | Could | planned (no task id) | Today one response with every organisation |
| PLT-017 | `timezone` in the member payload | Could | planned (decision D-3: deferred, no task id) | |
| PLT-018 | Platform Read API client for Assets (Assets transition stages T1 to T3) | Could | planned (after go-live) | |

## Non-goals

- Webhooks with the full payload (nudges carry only the organisation and the latest sequence).
- Write access to identity, membership or access from products (products never write those fields).
- A message broker (decision S-9).
