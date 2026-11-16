# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each entry lists the change and its user-visible or deploy-visible effect. Commit details: `../docs/wrapup/CHANGE-LEDGER.md`.

## [Unreleased]: elevation, branch `feat/elevation`

### Changed
- 3.1: design tokens for the shared kit (DRD 9.1): type scale (`text-label/table/body/section/title/tile`), `max-w-content`, rail and top-bar sizes, row heights, `duration-fast/panel`, `rounded-control/card`; `.tabular` utility; reduced-motion rule. No new colours. Mirrored in `constants/theme.ts`.
- 2.7: two scheduled jobs (`lib/invitationJobs.ts`, via `periodic.every`): an invitation reminder every 30 minutes (one reminder e-mail, template `invite_reminder`, for a pending invitation expiring in 23 to 24 hours; carries no link because the raw token is never stored) and a nightly delete of accepted, revoked and superseded invitations 180 days after their last change.
- 2.6: operator onboarding API (`GET /orgs/:id/onboarding`, `POST /orgs/:id/onboarding/resend-invite`, `PATCH /orgs/:id/onboarding/first-admin`, `GET /onboarding`) in `operator/onboarding.ts`. The first admin is now found through `UserRole` + the Super Admin role (`findFirstAdmin`), not the legacy `User.role`.
- 2.5: `POST /operator/v1/orgs` provisions in one transaction (company, roles, security policy, entitlements, first admin, invitation, welcome e-mail row, events). A failure leaves nothing behind; the cleanup block is gone. `seedSystemRoles`, `seedSecurityPolicy` and `seedDatabase` take an optional session; `EmailMeta` takes an optional `session` so the outbox row joins the caller's transaction. `invite_email_sent` now means "accepted for delivery" and is always true on a 201.
- 2.4: member detail shows an Invitation panel for invited members (state, last sent, expiry, e-mail delivery status and last error) with Resend, Copy link (new link, no e-mail, shown once, audited) and Revoke. New `GET /people/:id/invitation`, `POST /people/:id/invitation/revoke`; `resend-invite` accepts `?copy=true`.
- 2.3: the activation page verifies the link on load and shows the form, or an expired / superseded / already-used / revoked / not-valid notice with its action (`Send me a new link`, `Sign in`); the e-mail field is read-only. Forgot and reset password use the same `AuthNotice`.
- 2.2: `POST /people/verify-invite` answers six outcomes with codes (`INVITE_EXPIRED`, `INVITE_SUPERSEDED`, `INVITE_ALREADY_USED`, `INVITE_REVOKED`, `INVITE_NOT_FOUND`); new public `POST /people/renew-invite` (always 202, 3 per invitation per day); `POST /auth/setup-password` runs in one transaction with an atomic consume, `email` is optional, and a reused or expired link now answers the same codes instead of `INVALID_TOKEN` (400).
- 2.1: `InviteToken` becomes `Invitation` (kind, state, no TTL index) and every invitation is made by `lib/invitations.ts`; a new invitation supersedes the user's pending one. The `invite_tokens` collection is not migrated (fresh start); `lib/lifecycleAutomations.ts` (dead code with a placeholder link) is removed.

## [Unreleased]: wrap-up clean-up (2026-11-13), branch `chore/wrapup`

### Added
- QR code on the MFA enrolment page, with a copy button for the setup key.
- `AuthLayout` for the signed-out pages (login, onboarding, forgot and reset password).
- `npm run typecheck` in server and client.
- Repository docs: `README.md`, `AGENTS.md`, `DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/CONFIGURATION.md`, `docs/portals/*`.

### Changed
- Hosted sign-in pages use the Karbexa brand and are skinned per app: Products light, Admin dark with an "Admin" badge, Operator dark with a red "Operator" badge.
- Brand amber is `#f59e0b` (was `#f5b02a`), matching the products app.
- Package names `@karbexa/admin-api` and `@karbexa/admin-web`. Node 22 LTS baseline (`engines`, `.nvmrc`, `@types/node` 22).
- **Product launcher URLs** default to `PRODUCTS_SPA_ORIGIN` + the product page (for example `/people/home`). Existing databases update on the next `npm run seed:products`.
- `npm run seed:first` requires `SEED_ADMIN_PASSWORD`; it no longer has a built-in default password.
- `server/.env.example` lists every optional variable the code reads; the broken key-format comment is repaired; unused `SENDGRID_API_KEY` removed.

### Fixed
- `GET /api/v1/work-schedules/assignments` was unreachable (captured by `/:id`).
- `DELETE /api/v1/holidays/assignments/bulk` was unreachable (captured by `/assignments/:id`).

### Removed
- One-off scripts at the server and client roots; root `scripts/seed-e11.ts` forwarder. Untracked: `client/.env`, `*.tsbuildinfo`, `.omc/`.
- Old planning documents moved to `docs/archive/` (they were previously not in git at all).
