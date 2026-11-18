# Identity: what the user sees

Two kinds of screens: **hosted pages** rendered by the server (sign-in, enrolment, account, logout), and a few **SPA pages** in the Admin web app that start or finish a flow. Design language: `../../DESIGN.md` for the Admin app; the hosted pages carry their own inline CSS built by `server/src/identity/html.ts`.

## Hosted pages (server-rendered)

| Page | Route | Purpose | Data source | Actions | States |
|---|---|---|---|---|---|
| Tenant sign-in | `/realms/tenant/interaction/:uid` | Password step | `identity/interactions.ts` | Sign in; Microsoft sign-in link when Entra is configured | Generic error ("Incorrect email or password."), locked, SSO required, IP blocked, expired interaction |
| Tenant TOTP | same, step 2 | 6-digit code or recovery code | same | Verify; use a recovery code | Wrong code (5 wrong end the interaction) |
| Tenant enrolment | same, step 2 for a member without TOTP | Scan the QR code or type the setup key | same | Confirm code | Wrong code |
| Account page | `/realms/tenant/account` | Password, TOTP, recovery codes, sessions | `identity/account.ts` | Change password; re-enrol TOTP; new recovery codes; revoke one or all other sessions | No session redirects to `${ADMIN_SPA_ORIGIN}/login`; CSRF failure |
| Logout | `/realms/<realm>/oauth/end_session` | Auto-submits the confirm form | provider | none | |
| Operator sign-in, MFA, enrolment | `/realms/operator/interaction/:uid` | Staff sign-in; enrolment shows the setup key and an `otpauth://` link (no QR) | `operator/interactions.ts` | Sign in; verify; enrol | Generic error; locked; IP not allowed gives 403 |

No hosted page has a "no permission" state: access is decided at sign-in and shown as a denial message.

### Skin per client (`shellForClient` in `server/src/identity/html.ts`)

One layout (left brand panel and card). The theme follows the OIDC client of the interaction.

| Client | Theme | Badge | "to continue to" |
|---|---|---|---|
| `karbexa-admin-spa` | dark | Admin | Karbexa Admin |
| `karbexa-products-spa` | light | none | Karbexa |
| `karbexa-operator-spa` (and every operator realm page through `OPERATOR_SHELL`) | dark | Operator (red) and a "Karbexa staff only" note | Karbexa Operator console |
| unknown or none | follows `prefers-color-scheme` | none | none |

### Page security

Every page sets a per-response nonce CSP: `default-src 'none'`, nonce'd style and script, `img-src 'self' data:`, `form-action 'self'` plus the three SPA origins (and localhost variants outside production), `frame-ancestors 'none'`, `base-uri 'none'`. No external assets; the TOTP QR code is a local PNG data URI. Do not add external fonts, scripts or images.

## SPA pages that belong to the flow (Admin web app)

| Route | Component | Purpose |
|---|---|---|
| `/login` | `client/src/pages/auth/LoginPage.tsx` | Button that starts OIDC login; shows a signed-out note when `?signed_out` is present |
| `/auth/callback` | `client/src/pages/auth/CallbackPage.tsx` | Exchanges the code, stores tokens in memory, loads the profile |
| `/forgot-password`, `/reset-password` | `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` | Password reset request and completion |
| `/onboarding` | `OnboardingPage.tsx` | Invitation acceptance: verifies the link on load, then the password form or one of five notices (`components/ui/AuthNotice.tsx`; hooks in `features/auth/hooks/useInvitation.ts`); the e-mail is read-only |
| `/operator/callback`, `/operator/accept-invite` | `client/src/pages/operator/OperatorCallbackPage.tsx`, `OperatorAcceptInvitePage.tsx` | Operator code exchange; operator invitation accept (see `../command-center/UI.md`) |

Copy rules: say what happened, why, and what to do next (activation, forgot and reset pages share `AuthNotice`). Never reveal whether an e-mail has an account on a public page; specific invitation states are shown only to someone holding a real link.
