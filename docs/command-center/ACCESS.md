# Command Center: who may do what

## Roles and permissions

Four operator roles in a static map (`server/src/operator/permissions.ts`, `ROLE_PERMISSIONS`; no per-permission storage). An operator holding several roles gets the union; unknown role names grant nothing. `GET /me` needs no permission (`anyOperator`); the two public invite routes carry `publicRoute`.

| Permission | platform_admin | operations | support | auditor | Routes |
|---|---|---|---|---|---|
| `overview.read`, `tenants.read`, `products.read`, `health.read` | yes | yes | yes | yes | overview, `/orgs*` reads, `/plans`, `/onboarding`, `/products`, `/health*`, announcement read |
| `notes.write` | yes | yes | yes | no | notes |
| `onboarding.write` | yes | yes | yes | no | resend invitation, change first admin |
| `tenants.write` | yes | yes | no | no | create, suspend, reactivate, plan assignment, tags and trial, Entra approval |
| `tenants.close` | yes | no | no | no | close organisation |
| `entitlements.write` | yes | yes | no | no | entitlement override and its removal |
| `plans.write` | yes | no | no | no | plan create, update, apply |
| `announcements.write` | yes | yes | no | no | announcement set, end |
| `audit.read`, `audit.export` | yes | no | no | yes | `/audit`, `/audit/export` |
| `security.read` | yes | no | no | yes | `/security` |
| `operators.read` | yes | no | no | yes | `GET /operators`, operator sessions list |
| `operators.write` | yes | no | no | no | invite, create, update, session revoke |

`products.write` (standalone portal registration) is not defined yet: planned WS-C C-1. `server/src/operator/__tests__/permissions.test.ts` walks the router and fails when a route has no permission mark.

## Rules beyond the role

- TOTP is mandatory for every operator sign-in; the first sign-in enrols (`../identity/ACCESS.md`).
- The IP allow-list `OPERATOR_IP_ALLOWLIST` applies to `/operator/v1` (in `requireOperator`) and to the whole `/realms/operator` realm (`app.use('/realms/operator', requireOperatorIp)` in `server/src/app.ts`). Empty list: allowed outside production, **every request refused with 403 in production**.
- An operator cannot suspend themselves (409 `SELF_SUSPEND`); the last active `platform_admin` cannot be suspended or demoted (409 `LAST_PLATFORM_ADMIN`).
- A password change, MFA reset or suspension of an operator revokes all of that operator's sessions.
- Note deletion: the author, or an operator with `tenants.write`.
- Operators read tenant metadata only; they never read tenant business data.

## Defaults applied to an organisation

At provisioning and on plan assignment (`ensureDefaultAccess` in `server/src/operator/routes.ts`, driven by each product's manifest `default_assignments`), each only when the product's entitlement is active: the dynamic group "All Members" (`dynamic_rules: {}`) gets `people` to `employee` and `desk` to `requester`. Product keys in entitlement and plan routes are checked against the registry (400 `UNKNOWN_PRODUCT`). Product role catalogs: `../admin-center/ACCESS.md`.

## Data scope

Cross-tenant by design, scoped by the organisation in the URL. There is no per-operator tenant restriction. `read_only` does not exist at operator level: use the `auditor` role.

## Security invariants and the tests that prove them

| Invariant | Test |
|---|---|
| Every operator route has a permission mark | `server/src/operator/__tests__/permissions.test.ts` |
| A tenant token gets 401 from `/operator/v1`; a non-operator token never reaches a handler | `smoke:sprint2` 7.3 block |
| IP allow-list read per request, fail-closed in production | `smoke:sprint2` `OPERATOR_IP_ALLOWLIST` block |
| Operator lockout after 5 failures and security events | `smoke:login` "Plan 0.4" block |
| Suspend, close, password change, MFA reset revoke sessions; last `platform_admin` guard | `smoke:sprint2` C7 cases |
| Notes and seats of one organisation are invisible to another | `smoke:sprint2` 7.3 block |
| `invite_token` is exposed only outside production with `EXPOSE_INVITE_TOKEN=true` | `smoke:sprint2` L3-9 block |
| Audit CSV neutralises formula characters; the export is itself audited | `server/src/operator/__tests__/audit.test.ts` |
| Public operator invite routes are the only ones without an operator token | `permissions.test.ts` (allow-list) |
