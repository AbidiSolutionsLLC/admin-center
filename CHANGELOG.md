# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Each entry lists the change and its user-visible or deploy-visible effect. Commit details: `../docs/wrapup/CHANGE-LEDGER.md`.

## [Unreleased]: elevation, branch `feat/elevation`

### Changed
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
