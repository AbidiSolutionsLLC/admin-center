# PROGRESS WS-C: standalone portal support

Branch `ws/ws-c` (Admin) and `ws/ws-c` (products, C-6 only). Spec: meta `docs/spec/02-MASTER-DRD.md` §8, PRD §4.4.
Deleted in Wave 2 after the integrator folds it into the docs.

## Tasks

| Id | State | Notes |
|---|---|---|
| C-1 | done | Routes in `operator/standalone.ts`: GET list, GET one, PUT register/update, POST rotate-secret, PUT per-tenant launch-url. Server typecheck clean. |
| C-2 | done | Client lookup through the oidc-provider adapter (`Client` model answered from the App registry; no cache, so a registry change is effective on the next request). Server typecheck clean. |
| C-3 | done | Gate as an oidc-provider interaction policy prompt `product_access` (runs on every authorization request, SSO included) plus a check in `extraTokenClaims`/claims on every code exchange and refresh. Hosted denied pages in `identity/html.ts` `deniedPage`. Committed together with C-4 (same files). Typecheck clean. |
| C-4 | done | `buildStandaloneClaims` (lib/standalonePortals.ts); ID token and userinfo through a wrapped `findAccount`, access token through `extraTokenClaims`. Committed with C-3. |
| C-5 | done (partial on one trigger, see Needs) | `lib/backchannelLogout.ts`: signed logout token (RS256, typ logout+jwt, tenant key), one `Job` per client, SSRF-guarded delivery. Queued from `destroyProviderSession` (revocation, suspension, termination, tenant suspension, admin revoke), from the end-session handler (sign-out) and on refresh denial (assignment removed or entitlement suspended). Typecheck clean. |
| C-6 | not started | |
| C-7 | not started | |

## Needs from others

- Proactive logout when access to one portal ends without a refresh (assignment removed, entitlement suspended): the code paths that do that (assignments, overrides, plans) are not owned by WS-C. `queueProductBackchannelLogouts(companyId, productKey, memberIds | undefined, reason)` in `lib/backchannelLogout.ts` is ready to be called from there (after commit). Until then the portal is logged out at its next refresh (at most 10 minutes), which is also when the refresh denial queues the logout.

- `models/SecurityEvent.model.ts`: add `product_access_denied` to `SecurityEventType` and the schema enum (additive).
- `operator/permissions.ts` (not owned by WS-C) has no `products.write` permission. `requireProductsWrite` in `operator/standalone.ts` accepts the permission or the role `platform_admin`, so registration works now; whoever owns `permissions.ts` should add `products.write` to `ROLE_PERMISSIONS.platform_admin` (the fallback then becomes redundant, not wrong).

## Found while working

- C-5 differs from the plan: the shared job runner (`lib/jobs.ts`, owned elsewhere) retries 4 times (5 attempts) with backoff 1, 5, 30, 120 minutes, not 3 retries. Changing it would affect every job type.

- `SecurityEvent` has no `product_access_denied` type in its enum, and `models/SecurityEvent.model.ts` is not owned by WS-C, so `logProductAccessDenied` inserts through the collection (bypassing the enum). Works and reads back; should become `logSecurityEvent` once the enum has the type.
- `User` has no member type field yet, so `member_type` is `workforce` for everyone (`external` only when a later model supplies it; the claim builder already honours it).
- For a standalone client the access token carries only the DRD 8.5 claim set (no `org_roles`, `idn`, `apps`), so a third-party portal never sees Admin roles.
- `sid` reaches the ID token through the `openid` claim list (value from the session uid), in addition to oidc-provider's own `sid` when a back-channel URI is registered.

- The first registration of a confidential client returns `client_secret` once (HTTP 201, `Cache-Control: no-store`); later PUTs never return it. Rotation returns the new secret once.

## Decisions to record

- C-5: `sid` toward a standalone portal is the Karbexa session id everywhere (ID token, access token, logout token). oidc-provider's own per-client sid is overwritten with it at `authorization.accepted` for standalone clients. oidc-provider's built-in `backchannelLogout` feature stays OFF: Admin sends the logout tokens itself (Job, retries, health counting).

- C-2: standalone clients are served by the adapter (`identity/providers.ts` `Adapter.find` for model `Client` -> `lib/standalonePortals.ts findStandaloneClientMetadata`), not by rebuilding a client list. oidc-provider 9.13.3 caches built clients by a hash of the metadata, so each rotation or URI change adds one cached entry (LRU-bounded). The previous secret of a rotation is accepted by wrapping `Client.prototype.compareClientSecret` on the tenant provider (extra client metadata `karbexa_previous_secret*`).
- C-2: for a per-tenant portal, the tenants' launch-URL origins are added to the accepted redirect and post-logout URIs (same paths as registered). C-3 requires the member's own tenant origin.

## Tests written, not run

- C-5: `server/src/lib/__tests__/backchannelLogout.test.ts` (logout token claims). Delivery, queueing on revoke and the matching `sid` are covered by the smoke additions listed under C-8 below.
- C-3, C-4: same file: `decideGate` decision table, per-tenant redirect refusal, `buildStandaloneClaims` claim set. The provider-level cases (code + `product_role`, denied page, refresh denied after removal) are in the smoke script task below.
- C-1, C-2: `server/src/lib/__tests__/standalonePortals.test.ts` (validation, client id, auth methods, secret generation, no secret in the view, client metadata, rotated secret window, per-tenant URIs).
