# Platform API: who may do what

Callers are service clients, not people. Access is decided by the OAuth scopes on the token, plus a per-client product allow-list for catalog writes. Member access to products is *computed* here (effective access, `../admin-center/ACCESS.md`) and *enforced* in the products.

## Scopes

| Scope | Grants |
|---|---|
| `platform.org.read` | orgs list, org, departments, locations, effective calendars |
| `platform.members.read` | members list and single member |
| `platform.access.read` | effective access |
| `platform.sessions.read` | session revocations |
| `platform.events.read` | event feed |
| `platform.role_catalog.write` | role catalog PUT (plus product allow-list) |
| `products.internal.read` | issued to `karbexa-admin-backend` for the products backend's internal API (not checked by Admin) |

The services provider grants all `platform.*` scopes to `karbexa-products-backend` (`PLATFORM_API_SCOPES` in `server/src/identity/config.ts`).

## Rules

| Rule | Detail |
|---|---|
| Audience and realm | Only tokens from the `services` realm with audience `urn:karbexa:platform-api`, `token_use: service`, at most 15 minutes old, are accepted (`authenticateService`) |
| Allowed client | `client_id` must be `karbexa-products-backend` or have products in `PLATFORM_CLIENT_PRODUCTS` |
| Product allow-list | `PUT /apps/:productKey/role-catalog` and `/manifest` need the product in the client's allow-list (403 `PRODUCT_NOT_ALLOWED`). Without `PLATFORM_CLIENT_PRODUCTS`, `karbexa-products-backend` may write the five built-in products (`people`, `projects`, `sign`, `desk`, `kb`) and any other client none. A new product key is accepted only from a client whose allow-list names it |
| Organisation scope | Tokens are **not** bound to an organisation: any authenticated client holding the scope can read any organisation. This is accepted for the single products backend; revisit before a second client is added |
| Reserved key | `admin` is never a product key |
| `read_only` | Not applicable to service clients. A member's `read_only` product role is carried in `effective-access` and enforced by the product |

## Security invariants and the tests that prove them

| Invariant | Test |
|---|---|
| Scope check on every route; per-client rate limit; auth-failure throttle | `smoke:sprint2` E4 blocks; `server/src/platform/__tests__/rateLimit.test.ts` |
| Outbox atomicity: no event without its domain change, same correlation id | `smoke:sprint2` E4a block |
| Nudge signature, backoff, SSRF guard | `server/src/lib/__tests__/platformDispatcher.test.ts`, `ssrfGuard.test.ts` |
| Role catalog lock, `ROLE_IN_USE`, fan-out; manifest publish | `smoke:sprint2` E4d and 1.3 blocks |
| No literal product-key list in server code | `server/src/lib/__tests__/productKeyGuard.test.ts` |
| Services token cannot call tenant or operator APIs | `smoke:login` (services token rejected by `requireAuth`) |
