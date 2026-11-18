# Identity (sign-in, tokens, realms, MFA, sessions)

The embedded OpenID Connect identity provider that runs inside the Admin Express server. It signs in every Karbexa app (Admin web app, products web app, operator console), issues the access tokens every API verifies, hosts the sign-in pages, and keeps the `Session` record that makes revocation immediate. Platform-wide contract: meta repo `docs/architecture/03-IDENTITY-AND-TOKEN-SPEC.md` (link, not copied here). Where it and the code differ, the code is described and the difference is in `STATUS.md`.

## Users and roles

| Realm | Who signs in | Client(s) | Audience | Second factor |
|---|---|---|---|---|
| `tenant` | Members of customer organisations | `karbexa-admin-spa`, `karbexa-products-spa` | `urn:karbexa:admin`, `urn:karbexa:products` | TOTP always (enrol at first sign-in), or Microsoft Entra with upstream MFA |
| `operator` | Karbexa staff (`OperatorAccount`) | `karbexa-operator-spa` | `urn:karbexa:operator` | TOTP always; IP allow-list |
| `services` | Machine clients | `karbexa-products-backend`, `karbexa-admin-backend` | `urn:karbexa:platform-api`, `urn:karbexa:products-internal` | `private_key_jwt` (no user) |

## Code map

| Folder / file | Holds |
|---|---|
| `server/src/identity/config.ts` | Realm names, client ids, audiences, scopes, `getIdentityConfig()` (env), `assertRequireModule()` |
| `server/src/identity/providers.ts` | One `Provider` per realm: clients, TTLs, features, `extraTokenClaims`, `loadExistingGrant`, logout pages |
| `server/src/identity/index.ts` | `initIdentity()` and `mountIdentity(app)` |
| `server/src/identity/interactions.ts` | Tenant hosted login: password, TOTP, enrolment, recovery code, Entra, abort |
| `server/src/identity/federationLink.ts` | Entra first-sign-in linking decision (pure logic, unit tested) |
| `server/src/identity/account.ts`, `accounts.ts` | Account page; `loadAccessContext`, `pickMembership`, `findAccount` |
| `server/src/identity/sessions.ts` | `ensureSessionForToken`, `findLiveSession`, `revokeSession`, `revokeSessionsTx`, `revokeIdentitySessions`, `destroyProviderSession` |
| `server/src/identity/keys.ts`, `mongoAdapter.ts`, `recoveryCodes.ts`, `html.ts` | Signing and cookie keys; oidc-provider storage; recovery codes; page shell, CSP, skin |
| `server/src/operator/interactions.ts` | Operator hosted login (password, mandatory TOTP) |
| `server/src/controllers/auth.controller.ts` | Lockout, IP policy, password expiry, security events, password setup and reset, logout |
| `server/src/middleware/auth.ts`, `server/src/operator/middleware.ts`, `server/src/platform/requireServiceToken.ts` | Token verification for the three APIs |
| `client/src/lib/oidc.ts`, `session.ts`, `apiClient.ts`, `client/src/store/useAuthStore.ts` | SPA side: PKCE login, refresh, memory-only token store |

## Run it locally

Whole platform: `docs/LOCAL-DEVELOPMENT.md` in the meta repo, or `node scripts/dev.mjs` from the workspace root. Admin only: `cd server && npm run dev` with `server/.env` filled in (`../CONFIGURATION.md`). Dev signing keys are generated in `server/.local/` on first start.

Tests (from `server/`): `npm test` (unit, includes `src/identity/__tests__/`) and `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:login` (end-to-end sign-in). Last real results: `STATUS.md`.

## Non-negotiable rules

- Three realms, three key sets, three audiences. A token from one realm must never be accepted by another API (`requireAuth`, `requireOperator`, `authenticateService` each check issuer, audience and `token_use`).
- A second factor is always required for local sign-in. There is no switch to turn it off.
- The `Session` row is the source of truth for revocation. `requireAuth` checks it on every request; never rely on token expiry alone.
- Unknown e-mail and wrong password give the same answer at the same cost (dummy bcrypt).
- At every token issuance access is re-checked (`loadAccessContext`: identity active, membership in an access state, organisation active).
- Hosted pages are server-rendered with a per-response CSP nonce, no external assets and no secrets in markup.
- Production: realm keys and cookie keys are required, `TRUST_PROXY` must be explicit, `ID_ISSUER_ORIGIN` must be https. Never weaken these guards.
- Never return a password hash, TOTP secret or token from an API; never log them.

## The other files

[PRD](PRD.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATA-MODEL](DATA-MODEL.md) · [API](API.md) · [ACCESS](ACCESS.md) · [UI](UI.md) · [STATUS](STATUS.md) · [DECISIONS](DECISIONS.md). Sibling folders in this repo: `../admin-center/`, `../command-center/`, `../platform-api/`.
