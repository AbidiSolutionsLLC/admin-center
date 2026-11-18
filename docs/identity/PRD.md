# Identity: product requirements

Source of truth for what sign-in must do. State is read from the code and `STATUS.md` (2026-11-18). Features are never deleted, only marked `dropped` with a date.

## Personas

| Persona | Needs |
|---|---|
| Member (customer) | One sign-in for every Karbexa app; safe account recovery; see and end own sessions |
| Org IT admin | Enforce MFA and SSO, reset a member's MFA, end sessions |
| Operator (Karbexa staff) | A separate, stricter sign-in to the Command Center |
| Product backend (service) | Obtain a token to call the Platform API; verify member tokens locally |
| Standalone portal (Assets, Zyntrus) | Sign Karbexa members in and learn their product role |

## Features

| ID | Feature | Priority | State | Acceptance criteria |
|---|---|---|---|---|
| IDN-001 | Three realms (`tenant`, `operator`, `services`) with separate keys, issuers, audiences and cookie keys | Must | built | A tenant token is rejected by `/operator/v1` and `/platform/v1`; each realm serves its discovery document |
| IDN-002 | Tenant hosted password sign-in with a uniform error for unknown e-mail and wrong password | Must | built | `smoke:login`: identical response and status for both cases |
| IDN-003 | Mandatory TOTP with first-sign-in enrolment (QR code and setup key) | Must | built | A member without TOTP is sent to enrolment; 5 wrong codes end the interaction with `access_denied` |
| IDN-004 | Recovery codes (10, hashed, one use each), accepted in the TOTP step | Must | built | A used code is rejected the second time |
| IDN-005 | Lockout (default 5 failures in 30 min, 30 min lock), organisation IP policy, password expiry | Must | built | A locked member cannot sign in with the right password; every failure writes a `SecurityEvent` |
| IDN-006 | SSO enforcement: local sign-in refused for a verified domain when the connection has `enforce_sso` | Should | built | "Single sign-on is required" message |
| IDN-007 | Microsoft Entra federation (one platform app, one connection per tenant), linked by verified `(issuer, oid)`; first-sign-in link only for a verified domain and an existing member | Must | built | `federationLink.test.ts`; an unmatched account gets "No Karbexa account is linked" and a `login_failure` event. The Microsoft callback itself needs a live tenant to exercise |
| IDN-008 | Entra just-in-time member creation (`jit_provisioning: create_member`) | Could | planned (no task id; needs a role, lifecycle and seat policy first) | The setting is stored and never read today |
| IDN-009 | Sessions with revocation as the source of truth; provider session, grants and tokens destroyed on revoke; `session.revoked` event | Must | built | `smoke:login`: after logout the Admin API answers 401 `SESSION_REVOKED` |
| IDN-010 | Account page: change password, re-enrol TOTP, new recovery codes, list and end sessions | Should | built | `account.test.ts`; every POST needs a CSRF token |
| IDN-011 | Operator realm: password plus mandatory TOTP, lockout, IP allow-list that fails closed in production, `OperatorSession` rows | Must | built | `smoke:sprint2` operator login block; `smoke:login` "Plan 0.4" block |
| IDN-012 | Services realm: `client_credentials` with `private_key_jwt` for the products backend and the admin backend | Must | built | `smoke:sprint2` L3-4 block |
| IDN-013 | Account activation (invitation link) and password reset; six specific invitation outcomes; one atomic accept | Must | built | Endpoints in `../admin-center/API.md` (`/people/verify-invite`, `/auth/setup-password`); `smoke:login` 2.2 block |
| IDN-014 | Hosted pages skinned per client (Admin dark, products light, operator dark with a red badge) | Should | built | `enrol-ui.test.ts` page shell |
| IDN-015 | Signing-key rotation with a JWKS key set (current and previous) | Should | built | `getPublicJwks` verifies tokens signed by either key |
| IDN-016 | `apps` claim in the tenant access token carries the member's products | Could | partial | The claim exists and is always `[]`; products read effective access from the Platform API instead |
| IDN-017 | Standalone portal clients registered from the product registry (`karbexa-<key>`, no redeploy), access gate at authorize and refresh, `product_role` claim, back-channel logout | Must for Assets and Zyntrus | planned: WS-C C-2, C-3, C-4, C-5 | Specification: meta repo `docs/spec/02-MASTER-DRD.md` section 8 |
| IDN-018 | Operator invitation accept (set password; TOTP enrolled at first sign-in) | Should | built (plan 04 C2) | Owned by the Command Center, see `../command-center/PRD.md` CMD-024 |
| IDN-019 | E-mail one-time password as a second factor | Could | planned (no task id) | `mfa.email_otp_enabled` exists on `Identity`; no login code uses it |
| IDN-020 | Token introspection endpoint | Could | planned (no task id; local verification is the design) | Not enabled |
| IDN-021 | Operator sessions appear in the Platform API revocation feed (`realm=operator`) | Could | planned (no task id) | The feed is tenant-only today |

## Non-goals

- A consent screen (all clients are first party).
- Passwordless or social sign-in other than Microsoft Entra.
- Device flow, dynamic client registration.
- Self-registration of members (invitation only until external members exist; meta `docs/spec/01-MASTER-PRD.md` section 4.3).
