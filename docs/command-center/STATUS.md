# Command Center: status

Last verified: 2026-11-25 (Zyntrus real-browser walk and fixes B-21 to B-23); before that 2026-11-18 against `main` of `karbexa-admin` after the Wave 2 merge. Results below are the last real runs (2026-11-17); Wave 1 work (A-6, C-1, C-6, C-7) is typechecked and built only, its tests run in Wave 3. Platform roll-up: meta repo `docs/STATUS.md`.

## Built, by feature ID

| IDs | State | Proven by |
|---|---|---|
| CMD-001, CMD-002, CMD-004 to CMD-014, CMD-016, CMD-018, CMD-020 to CMD-024, CMD-026 | built | `smoke:sprint2` 554/554 (2026-11-17; operator blocks 4.1 to 4.13), unit 199/199, Playwright one spec per page (passed 2026-11-17 on `feat/elevation`), real-stack walk: all 11 Command Center pages clean. C2 and C7 cases passed on `feat/demo-fixes` (581/581) |
| CMD-015, CMD-019 | built, not tested | `standalone_portals` health component (C-6); direct `POST /operators` removed (A-6). Tests written: `standaloneHealth.test.ts`, smoke A-6 case |
| CMD-003, CMD-007, CMD-025 | partial | See known issues |
| CMD-027 | partial | Registration form, secret shown once, rotate secret (C-1, C-7); `operator-standalone.spec.ts` 7/7 in Edge (2026-11-25, with a phone-width case); rotate secret and entitlement override used in the Zyntrus real-browser walk (2026-11-25). Per-tenant launch URL: API only |
| CMD-017, CMD-028 | planned | See backlog |

## Known issues

| Issue | Where | Impact |
|---|---|---|
| No "needs attention" filter or `attention_count` on `GET /orgs` | `server/src/operator/routes.ts` | Overview items link to the tenant instead |
| The `provisioning_failed` signal reads "tenant in `provisioning` for over 15 minutes": the code has no `provisioning_failed` status and a failed provisioning rolls back, so the signal practically never fires | `server/src/lib/signals.ts` | The spec's retry step does not exist (decision 4.10) |
| The platform announcement is not proxied through the Platform API; the products app shows no banner | `server/src/platform/` | Announcement visible in Admin Center only |
| `GET /orgs?sort=members` loads and sorts every organisation (0.65 to 1.5 s at 5,000); `GET /security` reads the operator audit log by `created_at` only (0.26 to 0.38 s, grows with the log; a `{ action, created_at }` index is the likely fix); `/overview` and `/plans` aggregate over all companies (70 to 150 ms) | `server/src/operator/` | Performance at scale |
| Operator invitation links sent before C2 point at `/onboarding` and do not work | e-mail already sent | Re-invite those operators |
| The operator enrolment page shows the setup key and an `otpauth://` link, no QR code | `server/src/operator/interactions.ts` | Usability |
| `Company.last_activity_at` is touched at tenant sign-in at most hourly | `identity/` | Sort by last activity is hourly-accurate |
| Operator audit: `/audit?category=` returns no rows on data seeded without the stored `category` field (seed artefact) | `server/src/scripts/perf-lists.ts` | None in real use |
| Unmatched operator routes (for example the removed `POST /operators`) fall through to Express's default 404 (HTML), not the JSON envelope | `server/src/operator/routes.ts` | Cosmetic |
| Per-tenant launch URL of a standalone portal has an API but no screen (the natural place is the organization entitlements view) | `client/src/pages/operator/` | Operators use the API until Wave 3 |
| `client` eslint: one existing error in `AppLauncher.tsx` (`useAuthStore() as any`) | `client/src/components/layout/AppLauncher.tsx` | Lint only |
| Operator tokens are held in memory, so a reload goes back through sign-in | `client/src/features/operator/operatorAuth.ts` | By design |

Resolved (so nobody re-reports them): Zyntrus walk 2026-11-25: "admins without MFA" counted admins who had enrolled an authenticator (B-21), the client secret dialog was empty on phones (B-22), organisation create took about 50 s on a remote database (B-23); direct `POST /operators` removed (A-6, 2026-11-18); the 7.2 invitation findings (A-3 to A-5); operator invite has an accept page (C2); operator password change, MFA reset and suspension revoke sessions and the last `platform_admin` is protected (C7); Entra tenant approval has a UI; plan edits reach tenants through apply (dry run plus jobs); seats are enforced.

## Backlog (priority order)

| Task | What |
|---|---|
| Wave 3 | Run `operator-standalone.spec.ts`, `operator-products.spec.ts` (changed by C-7), the A-6 smoke case and the fake relying party cases (meta `docs/STATUS.md` → Next: Wave 3) |
| Wave 3 | Per-tenant launch URL screen |
| none | CMD-017 build version and start time per service; products app banner; `GET /orgs` attention filter; indexes for `/orgs?sort=members` and `/security`; E9 audit hash chain |

## Test commands and last results

| Gate | Command | Last real result |
|---|---|---|
| Typecheck, unit | `server`: `npm run typecheck`; `npm test` | 0 errors; 245/245 pass (2026-11-25) |
| Full smoke | `server`: `SMTP_HOST=127.0.0.1 SMTP_PORT=1 npm run smoke:sprint2` | 554/554 on `feat/elevation`; 581/581 on `feat/demo-fixes` (2026-11-17) |
| Browser specs | `client`: `npx playwright test e2e/operator-*.spec.ts` | passed on `feat/elevation` (2026-11-17); `operator-standalone.spec.ts` 7/7 in Edge (`channel: 'msedge'`, 2026-11-25); `operator-accept-invite.spec.ts` (9 cases) never run |
| Real-stack walk | `server`: `npm run walk:server`; `client`: `WALK_ONLY=operator node e2e-real/walk.mjs` | all 11 Command Center pages clean (2026-11-17) |
| Lists at scale | `server`: `npm run perf:lists` | 28 operator list endpoints measured; see known issues |

`seed:operator` is not a test: it creates or resets an operator and leaves MFA state unchanged on reset.
