# Identity: who may do what

Identity has no product roles of its own (it is not a product). This file states who may sign in, who may act on sessions and MFA, and the invariants that protect them.

## Who may sign in

| Realm | Rule | Code |
|---|---|---|
| tenant | `Identity.status` is `active`; the membership's `lifecycle_state` is one of `onboarding`, `active`, `probation`, `on_leave`; the organisation's `status` is `active` and `is_active !== false` | `loadAccessContext`, `hasAccessState` (`server/src/identity/accounts.ts`) |
| operator | `OperatorAccount.status === 'active'` and `roles` includes at least one operator role; password and TOTP; request from an allowed IP | `server/src/operator/accounts.ts`, `operator/middleware.ts`, `operator/signInGuard.ts` |
| services | A registered client with a valid `private_key_jwt`; one audience and scope set per client | `identity/providers.ts` |

The same access-state rule is used by the account page (`resolveAccountSession` in `identity/account.ts`) and at every token issuance.

## Who may act on sessions, MFA and sign-in settings

| Action | Who | Where |
|---|---|---|
| End own sessions, change own password, re-enrol TOTP, new recovery codes | The member, on the account page | `identity/account.ts` |
| Force logout of a member | IT_ADMINS | `POST /api/v1/security/force-logout/:userId` |
| End any session of the organisation | IT_ADMINS | `DELETE /api/v1/security/sessions/:tokenId` |
| Reset a member's MFA (clears TOTP, revokes all sessions of the identity) | IT_ADMINS | `POST /api/v1/people/:id/mfa-reset` |
| Create, verify and enforce an Entra connection | IT_ADMINS (activation also needs a verified domain and operator approval of the tenant id) | `/api/v1/security/identity-providers*` |
| Approve an Entra tenant id | Operator with `tenants.write` | `POST /operator/v1/orgs/:id/identity-providers/:connId/approve-tenant` |
| Reset an operator's MFA or password, revoke an operator's sessions | Operator with `operators.write` | `../command-center/ACCESS.md` |

`PERMISSION_GROUPS` and operator permissions are defined in `server/src/constants/roles.ts` and `server/src/operator/permissions.ts`.

## Security invariants and the tests that prove them

| Invariant | Test |
|---|---|
| Same response for unknown e-mail and wrong password | `smoke:login` (`server/src/scripts/smoke-oidc-login.ts`) |
| Second factor is always required; first login enrols | `smoke:login` |
| A services-realm token is rejected by `requireAuth` | `smoke:login` |
| Logout revokes the `Session`; the Admin API then answers 401 | `smoke:login` |
| Operator lockout after 5 failures; failures recorded as security events | `smoke:login` "Plan 0.4" block |
| Account page: CSRF, access-state check, session revoke | `server/src/identity/__tests__/account.test.ts` |
| Enrolment page shows a QR code and a correctly grouped setup key | `server/src/identity/__tests__/enrol-ui.test.ts` |
| Entra first-sign-in linking decisions (verified domain, one link per connection) | `server/src/identity/__tests__/federationLink.test.ts` |
| MFA reset: 401 without a token, 403 for an unauthorised role, 404 across organisations, 403 against a higher-ranked member | `server/src/controllers/__tests__/mfaReset.test.ts` |
| Trust-proxy parsing and production refusal | `server/src/lib/__tests__/trustProxy.test.ts` |
| Password-reset links never fall back to localhost; an unset origin fails loudly | `server/src/controllers/__tests__/resetLinkOrigin.test.ts` |

## Data scope and `read_only`

Not applicable: identity returns no product data. Product roles (including `read_only`) are decided by App Access (`../admin-center/ACCESS.md`) and carried to products through events and the Platform API.
