# Platform API: architecture

Pull-based integration. A change in Admin writes its domain change, its audit row and a `PlatformEvent` in one transaction (outbox). A dispatcher then sends a signed "nudge" to each subscriber; the subscriber pulls `GET /orgs/:orgId/events?after_seq=` and applies the events. Read endpoints let a subscriber resync. Repo-wide layout: `../ARCHITECTURE.md`; token issuance for the service clients: `../identity/ARCHITECTURE.md`; platform contract: meta `docs/architecture/05-API-CONTRACTS.md`, `06-PLATFORM-EVENT-CONTRACTS.md`, `07-PRODUCT-INTEGRATION-SPEC.md`.

## Layers

| Layer | Files |
|---|---|
| Router, auth, limits | `server/src/platform/index.ts` (`platformRouter`: correlation id, `platformAuthFailureLimiter`, `authenticateService`, `platformRateLimiter`, per-route `requireServiceToken(scope)`), `requireServiceToken.ts`, `rateLimit.ts` |
| Read API | `server/src/platform/readApi.ts` (orgs, events, members, departments, locations, session revocations; mounts calendars and role catalog), `calendars.ts` |
| Product registration | `server/src/platform/roleCatalog.ts`, `manifest.ts`; registry in `server/src/lib/productRegistry.ts`, `productCatalog.ts` |
| Outbox | `server/src/lib/platformEvents.ts`: `runInTransaction`, `onCommit`, `emitPlatformEvent`, `emitAppAccessChanged`, `emitAppAccessChangedBounded`, `fanOutAppAccessChanged`, `correlationIdFor` |
| Delivery | `server/src/lib/platformDispatcher.ts`, `platformLease.ts`, `ssrfGuard.ts` |
| Outbound | `server/src/platform/productsInternalToken.ts`, `openItems.ts` |
| Effective access | `server/src/lib/effectiveAccess.ts` (`computeEffectiveAccess`, rules in `../admin-center/ACCESS.md`) |
| Stream tickets (tenant API, not `/platform/v1`) | `server/src/platform/streamTickets.ts` |

## Request flow

`products backend` -> `POST /realms/services/oauth/token` (`private_key_jwt`) -> `GET /platform/v1/...` with the Bearer token -> pipeline in `API.md` -> handler -> JSON `{ ... }` (errors `{ error, code }`, no `success` field).

## Writing an event (outbox pattern)

`emitPlatformEvent(session, input)` increments `OrgEventCounter.seq` and inserts the `PlatformEvent` in the caller's transaction session, so the domain write, the audit row and the event commit or roll back together. See ARCHITECTURE.md for the full pattern.

Typical handler pattern: `../ARCHITECTURE.md` section 6.

## Nudge dispatcher

- Started in `server/src/index.ts` after `listen` (not in `createServer`). Disabled with `PLATFORM_DISPATCHER=off`. Interval `PLATFORM_DISPATCH_INTERVAL_MS` (default 2000 ms). Stops on SIGTERM / SIGINT and releases its lease.
- Subscriptions are upserted at start from `PLATFORM_SUBSCRIPTIONS`: JSON array `[{ "name", "url", "secret_env" }]`; `secret_env` must match `^PLATFORM_SUB_SECRET_[A-Z0-9_]+$` and names the env var holding the HMAC secret. Existing rows keep their `status`.
- Each cycle runs only on the instance holding the Mongo lease `platform-dispatcher` (TTL 30 s, renewed per nudge).
- For each active subscription and each org with `seq > 0`: nudge when `seq > last_nudged_seq`, or re-nudge every 60 s while `seq > last_acknowledged_seq`; skip while `next_attempt_at` is in the future. At most 4 nudges in flight.
- Nudge: `POST <url>` with body `{"org_id":"...","latest_seq":N}`, headers `Content-Type: application/json`, `X-Karbexa-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`, `X-Karbexa-Event-Id: <id of the latest event>`. 5 s timeout, no redirects, response body not read. 2xx = success.
- Failure: exponential backoff `min(1 h, 1000 ms × 2^attempts)`, error text stored on the cursor.
- URL safety (`ssrfGuard.ts`): https only (http allowed only for localhost outside production), no credentials in the URL, DNS resolved once, every address must be public unicast (private, loopback, link-local, metadata, NAT64, 6to4, Teredo, documentation and test ranges blocked), connection pinned to the validated address with the original Host / SNI.
- Receivers can verify with the exported `verifyNudgeSignature(secret, header, body, toleranceSec = 300)`.

## How products plug in

Products verify member tokens locally (audience `urn:karbexa:products`), project access from `app_access.changed` events and the effective-access endpoint, follow `session.revoked` through the events and the revocation feed (`GET /sessions/revocations`, polled about every 30 s), publish their role catalog and manifest at start, and call `GET /orgs/:orgId/calendars/effective` for holidays and schedules. Their consumer is in the products repo (`backend/` platform consumer); this repo only guarantees the contract above.

## Background jobs

The dispatcher (every 2 s by default) and the lease are started in `server/src/index.ts` after `listen`; the health check `event_dispatcher` reads the lease age and organisations not acknowledged (`../command-center/ARCHITECTURE.md`).

## External services

Subscriber URLs (the products backend, later standalone portals) through the SSRF guard; the products internal API for open items and sync health.

## Patterns to copy

| For | Copy |
|---|---|
| A new read endpoint | `server/src/platform/readApi.ts` (scope, org id validation, `updated_since` paging) |
| A new event type | an existing emitter in `server/src/controllers/groups.controller.ts`; additive only, recorded in meta `docs/DECISIONS.md` first |
| A scoped write | `server/src/platform/roleCatalog.ts` (allow-list, version lock, post-commit fan-out) |
