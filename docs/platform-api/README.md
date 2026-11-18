# Platform API (`/platform/v1`) and the event feed

The machine-to-machine surface through which the products backend (People, Projects, Sign, Desk, later Knowledge Base) and standalone portals read Admin data and follow changes: organisations, members, departments, locations, effective calendars, effective product access, session revocations, a per-organisation ordered event feed, product manifests and role catalogs, plus signed "nudge" webhooks telling a subscriber that new events exist. It is pull-based: events are stored in an outbox with a per-organisation sequence; a subscriber is nudged and then pulls.

## Users and roles

| Caller | What it may do |
|---|---|
| `karbexa-products-backend` (services realm client) | All `platform.*` scopes; may write the role catalog and manifest of the five built-in products (including `kb`) |
| Other service clients (later: standalone portals, Knowledge Base) | Only the scopes and products their `PLATFORM_CLIENT_PRODUCTS` entry allows |
| `karbexa-admin-backend` (Admin calling out) | Not a caller of this API; it obtains a token for the products backend's internal API (`API.md`, outbound) |

Scopes: `platform.org.read`, `platform.members.read`, `platform.access.read`, `platform.sessions.read`, `platform.events.read`, `platform.role_catalog.write` (`ACCESS.md`).

## Code map

| Path | Holds |
|---|---|
| `server/src/platform/index.ts` | `platformRouter`: pipeline, `GET /orgs/:orgId`, effective access |
| `server/src/platform/readApi.ts`, `calendars.ts` | Read endpoints, event feed, revocations, effective calendars |
| `server/src/platform/roleCatalog.ts`, `manifest.ts` | Role catalog write, manifest publish, `GET /apps` |
| `server/src/platform/requireServiceToken.ts`, `rateLimit.ts` | Token authentication, scopes, rate limits |
| `server/src/platform/productsInternalToken.ts`, `openItems.ts` | Outbound token and open-items proxy |
| `server/src/lib/platformEvents.ts` | Transactions, outbox, `emitPlatformEvent`, `emitAppAccessChanged` |
| `server/src/lib/platformDispatcher.ts`, `platformLease.ts`, `ssrfGuard.ts` | Nudges, single-instance lease, SSRF protection |
| `server/src/lib/effectiveAccess.ts`, `productRegistry.ts`, `productCatalog.ts` | Effective access, registry, role catalogs |
| `server/src/models/PlatformEvent.model.ts` and siblings | Event, counter, subscription, cursor, lease |

## Run it locally

Whole platform: `node scripts/dev.mjs` from the workspace root. The products backend needs `SERVICES_PRODUCTS_BACKEND_JWKS` registered in Admin and a matching private key on its side; subscriptions come from `PLATFORM_SUBSCRIPTIONS` (`../CONFIGURATION.md`).

Tests: `cd server && npm test` (`platformDispatcher.test.ts`, `ssrfGuard.test.ts`, `platform/__tests__/rateLimit.test.ts`, `productRegistry.test.ts`, `productKeyGuard.test.ts`, `controllers/__tests__/openItemsProxy.test.ts`, `streamTickets.test.ts`), `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2`; in the products repo `npm run test:e2e-platform` (19/19 on 2026-11-17). Results: `STATUS.md`.

## Non-negotiable rules

- Response shapes, event payloads, token claims and manifests change only additively, after a recorded decision (meta `docs/DECISIONS.md`); a task that would change them stops and reports.
- A domain change, its audit row and its event are written in one transaction (`emitPlatformEvent` inside `runInTransaction`); never emit an event outside the transaction of the change it describes.
- Events carry no secrets and no tokens.
- Every route has a scope; the client must be allowed the product for catalog writes.
- Subscriber URLs go through the SSRF guard (https, public addresses only, connection pinned).
- Events expire after 30 days; consumers must handle 409 `CURSOR_AHEAD` and 410 `CURSOR_EXPIRED` by resyncing.
- Product keys are data (registry), never a literal list in server code (`productKeyGuard.test.ts`); `admin` is reserved.

## The other files

[PRD](PRD.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA-MODEL](DATA-MODEL.md) · [API](API.md) · [ACCESS](ACCESS.md) · [UI](UI.md) · [STATUS](STATUS.md) · [DECISIONS](DECISIONS.md). Contract in the meta repo: `docs/architecture/05-API-CONTRACTS.md`, `06-PLATFORM-EVENT-CONTRACTS.md`, `07-PRODUCT-INTEGRATION-SPEC.md`.
