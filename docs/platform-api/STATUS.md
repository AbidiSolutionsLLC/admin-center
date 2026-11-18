# Platform API: status

Last verified: 2026-11-18 against `main` of `karbexa-admin` (4435d81). Results below are the last real runs (2026-11-17); nothing was run for this document. Platform roll-up: meta repo `docs/STATUS.md`.

## Built, by feature ID

| IDs | State | Proven by |
|---|---|---|
| PLT-001 to PLT-003, PLT-005 to PLT-011 | built | `smoke:sprint2` 554/554 (E3, E4, E4a, E4c, E4d, 1.3 blocks), Admin unit tests 199/199, products `test:e2e-platform` 19/19 (2026-11-17). Latency: Desk revocation p95 about 0.6 s (target 5 s), session revocation about 0.4 s (target 30 s), nudge path p95 about 0.6 s (target 5 s) |
| PLT-004, PLT-012 | partial | See known issues |
| PLT-013 to PLT-018 | planned | See backlog |

## Known issues

| Issue | Where | Impact |
|---|---|---|
| Service tokens are not bound to an organisation: any registered client reads every organisation. Product scoping applies only to catalog writes | `server/src/platform/index.ts`, `requireServiceToken.ts` | Acceptable for the single products backend; revisit before another client is registered |
| `GET /orgs` returns every organisation in one response | `server/src/platform/readApi.ts` | Grows with tenants |
| Effective calendars use only assignments targeting the resolved location itself; parent locations are not walked | `server/src/platform/calendars.ts` | A holiday calendar on a parent location is not applied to children |
| `/sessions/revocations?realm=operator` is always empty: the operator realm writes `OperatorSession` rows, not `Session` | `readApi.ts`, `operator/sessions.ts` | The feed is tenant-only |
| The stream re-check treats an organisation as allowed when `status === 'active' || is_active !== false`; a `suspended` organisation whose `is_active` is not `false` passes | `server/src/platform/streamTickets.ts` | Only for data written outside the operator routes (they set both fields) |
| Events older than 30 days are deleted by TTL; a subscriber further behind gets 410 `CURSOR_EXPIRED` and must resync | `PlatformEvent` TTL | By design |
| Manifest `capabilities` is validated and not stored | `server/src/platform/manifest.ts` | None yet |
| A manifest publish writes no operator audit entry (`OperatorAuditEvent.operator_id` is required and a service call has none) | `manifest.ts` | Decision 1.3 |
| A product key is accepted only from a client whose `PLATFORM_CLIENT_PRODUCTS` allow-list names it; the default list holds the four built-ins | `requireServiceToken.ts` | A new product needs configuration in Admin |
| No events for policies, workflows, data fields, integrations, notifications, IP restrictions, identity providers, security policies, teams, plan changes, operator accounts or IdP approval | emitters | Products are not told; none is consumed today |
| Standalone portal registration, `standalone_portals` health, standalone listings | not built | WS-C C-1, C-6 |

Resolved (so nobody re-reports them): the per-client rate limiter used an in-memory store in an old note; it now uses the shared MongoDB store (`middleware/mongoRateLimitStore.ts`).

## Backlog (priority order)

| Task | What |
|---|---|
| WS-C C-1, C-6 | Standalone registration, listings and health (PLT-013) |
| WS-D (registry entry D-2) | Knowledge Base manifest (PLT-014) |
| none | Organisation-bound service tokens; paged `GET /orgs`; parent-location calendars; store manifest `capabilities`; `timezone` in the member payload |

## Test commands and last results

| Gate | Command | Last real result |
|---|---|---|
| Unit | `server`: `npm test` | 199 pass (2026-11-17) |
| Full smoke | `server`: `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2` | 554/554 on `feat/elevation`; 581/581 on `feat/demo-fixes` (2026-11-17) |
| Products end to end | products repo `backend`: `npm run test:e2e-platform` | 19/19 (2026-11-17) |
