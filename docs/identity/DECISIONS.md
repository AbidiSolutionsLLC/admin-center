# Identity: decisions

Append-only, newest last. Product-level decisions only; platform-wide decisions are in the meta repo `docs/DECISIONS.md`. Original reasoning: `docs/archive/` of the meta repo and the git tag `docs-before-standard` of this repo.

| Date | ID | Context | Decision | Consequence | Decided by |
|---|---|---|---|---|---|
| 2026-11 | ARCH | Several apps need one sign-in and each backend must verify tokens itself | Admin is the identity authority: embedded OIDC provider with separate realms (tenant, operator, services); products verify tokens locally and consume events | Three key sets and audiences; a token from one realm is rejected by the other APIs | Owner (meta `docs/architecture/01-TARGET-ARCHITECTURE.md`) |
| 2026-11-11 | D-4 | Operator console must not be reachable from anywhere by accident | The operator IP allow-list fails closed in production and `TRUST_PROXY` must be set explicitly | An empty `OPERATOR_IP_ALLOWLIST` refuses every operator request in production; startup fails without `TRUST_PROXY` | Owner |
| 2026-11-13 | C-1 | Session length versus risk | Access token 10 min; operator session 30 min idle; tenant session 12 h idle and 7 days absolute (a 30-day refresh was rejected) | Values in `server/src/identity/config.ts` and `providers.ts` | Owner |
| 2026-11-13 | W-DES | Hosted pages looked different per app | One Karbexa sign-in design skinned per client: products light, Admin dark, operator dark with a red "Operator" badge | `shellForClient` in `identity/html.ts` | Owner |
| 2026-11-13 | W-NODE | `oidc-provider` is ESM and loaded with `require(esm)` | Node 22 LTS for CI and production (`engines >=22.12.0`) | Startup fails on older Node (`assertRequireModule`) | Owner |
| 2026-11-13 | FRESH | Legacy accounts and claim e-mails | Fresh start at go-live; no identities are migrated | `seed:e11`, `send:claims`, `migrate:identities` are kept for reference and are never used for go-live | Owner |
| 2026-11-16 | S-6 | Invitations were deletable tokens with one vague error | Invitations are kept records with states (pending, accepted, revoked, superseded; expired is derived); verification returns a specific reason; e-mail goes through an outbox | Codes `INVITE_EXPIRED`, `INVITE_SUPERSEDED`, `INVITE_REVOKED`, `INVITE_ALREADY_USED`, `INVITE_NOT_FOUND`; pending `InviteToken` links stop working after the upgrade | Owner |
| 2026-11-16 | 2.2 | `setup-password` answered 400 `INVALID_TOKEN` for reuse and expiry | It now answers the specific codes (409 or 410) | The `sendClaimEmails` test was updated; verify returns `data.at` with the two dates | Plan |
| 2026-11-16 | 5.11 | Entra linking by e-mail claim is the known account-takeover risk (Microsoft does not verify `email`) | Build safe first-sign-in linking only: verified domain on the connection, existing active member of that company, one link per connection, audited. JIT creation is not built | `identity/federationLink.ts`; an unknown Microsoft user is denied | Owner |
| 2026-11-17 | 7.2 | Security review of the public invitation routes | Findings are low and triaged into WS-A tasks A-3, A-4, A-5; nothing was changed in the review | See `STATUS.md` | Owner |
