# Identity: status

Last verified: 2026-11-18 against `main` of `karbexa-admin` after the Wave 2 merge. Test results below are the last real runs; Wave 1 work (A-3 to A-5, C-2 to C-5) is typechecked only, its tests run in Wave 3.

## Built

| Feature IDs | What | Proven by |
|---|---|---|
| IDN-001 to IDN-006, IDN-009 | Three realms, hosted tenant sign-in, mandatory TOTP and enrolment, recovery codes, lockout, IP policy, SSO enforcement, sessions with revocation | `smoke:login` 68/68 (2026-11-17, Phase 7) |
| IDN-007 | Entra federation by verified link, first-sign-in linking | `federationLink.test.ts`; the Microsoft callback was never run against a real Microsoft tenant |
| IDN-010 | Account page | `account.test.ts` |
| IDN-011, IDN-012 | Operator realm and services realm | `smoke:sprint2` 554/554 (2026-11-17; 567 expected on `main` after the paging follow-up) |
| IDN-013 to IDN-015 | Activation and reset flows, page skins, key rotation | `smoke:login` 2.2 block; real browser sign-in for both realms in the Phase 7.5 walk |
| IDN-018 | Operator invitation accept | smoke C2 block passed on `feat/demo-fixes` (2026-11-17); Playwright `operator-accept-invite.spec.ts` not run |

## Partial or not built

| Feature IDs | State |
|---|---|
| IDN-008 | Entra JIT member creation: setting stored, never read |
| IDN-016 | `apps` claim is always `[]` |
| IDN-017 | Built, not tested (WS-C C-2 to C-5): registry-driven clients, access gate, claims, back-channel logout. Unit tests written (`standalonePortals.test.ts`, `backchannelLogout.test.ts`); the provider-level fake relying party in `smoke-sprint2.ts` (DRD 8.8 cases) is **not written** (Wave 3). Proactive logout when access to one portal ends is wired in W3-2g (unit test `membersWithoutPortal`; the fake-relying-party smoke cases of W3-2h cover it end to end), not yet run |
| IDN-019, IDN-020, IDN-021 | E-mail OTP, introspection, operator sessions in the revocation feed: not built, no task id |

## Known issues

| Issue | Where | Impact |
|---|---|---|
| The account-page CSRF secret falls back to `ENCRYPTION_KEY` and then to a literal string. `loadCookieKeys()` always returns at least one key, so the literal is not reached in practice | `server/src/identity/account.ts` | Low |
| `applyProxy` reads `TRUST_PROXY` with default `'1'` and sets `maxIpsCount` only for a number; a CIDR list makes the provider trust proxies without a hop limit, unlike Express (`lib/trustProxy.ts`) | `server/src/identity/providers.ts` | Low; only with a CIDR list |
| After `POST /api/v1/auth/logout` the session is already destroyed, so the following `end_session` call finds no provider session; the redirect still lands on `/login?signed_out=1` | `auth.controller.ts`, `providers.ts` | None visible |
| Operator enrolment page shows the setup key and an `otpauth://` link, no QR code (the tenant page has one) | `server/src/operator/interactions.ts` | Usability |
| `logProductAccessDenied` writes to the `SecurityEvent` collection directly (the type is in the enum since Wave 2), so the model's post-save hook does not run for it | `lib/standalonePortals.ts` | Security policy hooks ignore these events |
| Back-channel logout retries follow the shared job runner (5 attempts, backoff 1, 5, 30, 120 min), not the 3 retries of the DRD | `lib/jobs.ts` | Slightly longer retry window |
| `member_type` is always `workforce` (`User` has no member type yet) | `lib/standalonePortals.ts` | None until external members exist |
| Behind Azure App Service, `X-Forwarded-For` carries `ip:port`, so `req.ip` is `ip:port`: `isIpInRange` rejects it (operator IP allow-list fails closed for listed IPs) and per-IP rate-limit keys become per connection | `server/src/utils/ipUtils.ts` | Must be fixed before Wave 4 (meta STATUS → Next: Wave 3) |
| Operator tokens are held in memory, so a page reload goes back through the operator realm | `client/src/features/operator/operatorAuth.ts` | By design |

## Backlog (priority order)

| Task | What |
|---|---|
| Wave 3 | Run the A-3 to A-5 smoke cases and the C-2 to C-5 unit tests; write and run the fake relying party cases in `smoke-sprint2.ts` |
| none | Entra JIT creation (needs an owner decision on role, lifecycle and seats) |
| none | E-mail OTP; introspection; operator sessions in the revocation feed |

## Test commands and last results

| Command (in `server/`) | Last real result |
|---|---|
| `npm run typecheck` | 0 errors (2026-11-17) |
| `npm test` | 199 pass (2026-11-17, Phase 7) |
| `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:login` | 68/68 (2026-11-17, Phase 7); the C2 and C7 cases on `feat/demo-fixes` also passed that day |

The 2026-11-17 Playwright runs on `feat/demo-fixes` are void (two runs overlapped on one machine; browsers were looked up in the wrong folder). Wave 3 of `docs/EXECUTION-PLAN.md` in the meta repo reruns them.
