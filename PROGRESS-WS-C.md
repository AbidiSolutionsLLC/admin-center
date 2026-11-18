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
| C-6 | partial | Done: health component `standalone_portals` (lib/health: probe through the SSRF guard, 5 s, degraded after 3 consecutive failures, never critical, counts undelivered back-channel logouts); `launchUrlFor` / `launchUrlsFor` (tenant override first); Admin launcher opens absolute URLs in a new tab with no opener; products `/me/apps` merge (`controllers/meController.js`, cache 60 s, branch ws/ws-c in karbexa-products). Open: the two server listings and the Platform API catalog are in files WS-C does not own (see Needs). Server typecheck and client `tsc -b` clean; products `node --check` and rbac gate clean. |
| C-7 | done | Products page: "Register standalone portal" (all DRD 8.2 fields, client-side checks mirroring the server), Edit, Rotate secret (confirm, then the secret is shown once, with the 24 h overlap), Hosting column. Client `tsc -b` clean, `npm run build` clean. The register action shows for the platform_admin role or the `products.write` permission (the API accepts either). |

## Needs from others

- C-6, Admin `/me/apps` tenant override: `controllers/appAccess.controller.ts` `getMyApps`: after loading `apps`, call `const urls = await launchUrlsFor(req.user!.company_id, keys)` (from `lib/standalonePortals`) and return `launch_url: urls[a.product_key] ?? a.launch_url`. Standalone apps already appear there with their absolute `launch_url` (the registration sets it).
- C-6, Platform API listing: `platform/manifest.ts` `view()` still reports `hosting: { mode: 'suite', launch_path }` for every app; for a standalone app it should return the `standaloneView` hosting block (no secrets). Same file or a new `platform/` route is also needed for the products merge: `GET /platform/v1/orgs/:orgId/launchers` (scope `platform.org.read`) returning `[{ product_key, name, launch_url (tenant override first, via launchUrlsFor), roles: [{ key, name }] }]` for standalone products the organisation holds an active entitlement to. New endpoint = additive Platform API change: needs a recorded decision first.
- C-6, products side of that: `backend/platform/platformApi.js` needs `listLaunchers(orgId)` (GET `/orgs/:id/launchers`). `controllers/meController.js` already calls it when present and shows no standalone tiles when absent. The products launcher frontend should open tiles with `external: true` in a new tab.
- C-6, Command Center health page label: `client/src/pages/operator/OperatorHealthPage.tsx` has a label map without `standalone_portals` (shows the raw key).
- Products `/me/apps` only sees a standalone key if the member's `req.access` projection contains it (event handlers / `MemberAccess`, WS-B and WS-D territory).

- Proactive logout when access to one portal ends without a refresh (assignment removed, entitlement suspended): the code paths that do that (assignments, overrides, plans) are not owned by WS-C. `queueProductBackchannelLogouts(companyId, productKey, memberIds | undefined, reason)` in `lib/backchannelLogout.ts` is ready to be called from there (after commit). Until then the portal is logged out at its next refresh (at most 10 minutes), which is also when the refresh denial queues the logout.

- `models/SecurityEvent.model.ts`: add `product_access_denied` to `SecurityEventType` and the schema enum (additive).
- `operator/permissions.ts` (not owned by WS-C) has no `products.write` permission. `requireProductsWrite` in `operator/standalone.ts` accepts the permission or the role `platform_admin`, so registration works now; whoever owns `permissions.ts` should add `products.write` to `ROLE_PERMISSIONS.platform_admin` (the fallback then becomes redundant, not wrong).

## Found while working

- C-7: `client/e2e/operator-products.spec.ts` asserted "no register action" for a platform admin; it now uses a read-only operator for that assertion (the register action is the new behaviour, covered by `operator-standalone.spec.ts`).
- C-7: the per-tenant launch URL of an organisation (`PUT /operator/v1/products/:key/tenants/:orgId/launch-url`) has an API but no screen yet; the natural place is the organization entitlements view (not owned by WS-C).
- `client` eslint reports one existing error in `AppLauncher.tsx` (`useAuthStore() as any`, line 24), not introduced by WS-C.

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

- C-7: `client/e2e/operator-standalone.spec.ts` (visibility by role, form validation without an API call, register shows the secret once and sends the manifest, rotate with confirmation, server refusal keeps the form open).
- Not written: the provider-level fake relying party (access -> code and `product_role`; no assignment -> denied page; entitlement suspended -> denied; assignment removed -> refresh denied; session revoked -> back-channel logout with matching `sid`; wrong redirect URI; registry change without restart). It needs the full stack and belongs in the Admin smoke suite (`server/src/scripts/smoke-sprint2.ts`, not owned by WS-C, WS-A territory). Cases are specified in DRD 8.8; the building blocks (`decideGate`, `buildStandaloneClaims`, `logoutTokenClaims`, `buildClientMetadata`) are unit-tested.
- C-6: `server/src/lib/__tests__/standaloneHealth.test.ts` (health rules, probe status rule, launch URL rule); products `backend/tests/unit/controllers/meControllerStandalone.test.js` (tile merge, deny by default, URL scheme guard).
- C-5: `server/src/lib/__tests__/backchannelLogout.test.ts` (logout token claims). Delivery, queueing on revoke and the matching `sid` are covered by the smoke additions listed under C-8 below.
- C-3, C-4: same file: `decideGate` decision table, per-tenant redirect refusal, `buildStandaloneClaims` claim set. The provider-level cases (code + `product_role`, denied page, refresh denied after removal) are in the smoke script task below.
- C-1, C-2: `server/src/lib/__tests__/standalonePortals.test.ts` (validation, client id, auth methods, secret generation, no secret in the view, client metadata, rotated secret window, per-tenant URIs).
