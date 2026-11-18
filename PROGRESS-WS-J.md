# PROGRESS-WS-J (Test authoring, Admin repo part)

Branch `ws/ws-j`, repo `karbexa-admin` (public: push only this branch, no tags). Deleted in Wave 2 after the integrator folds it into the docs.
Other parts: `scripts/check.mjs` (J-1) in the meta repo, products specs (J-3) in `karbexa-products`.

| Task | State | Note |
|---|---|---|
| J-2 | done (`node --check` only; never run) | `client/e2e-real/demo-walk.mjs` |

## J-2: demo-walk.mjs
Run by `node scripts/check.mjs demo-walk` (meta repo) against a stack that is running with `node scripts/dev.mjs --demo`, or by hand: `cd karbexa-admin/client && node e2e-real/demo-walk.mjs`. It starts and stops nothing. Environment variables are listed in the header of the file.

| Step | Plan check | What it does |
|---|---|---|
| D1.1 | D1 | operator signs in (password, authenticator; first sign-in enrols and the secret is kept) |
| D1.2 | D1 | Command Center overview, organisations, onboarding, platform health open clean |
| D1.3 | D1 | create-organisation dialog, three steps, plan Enterprise (or the last plan listed) |
| D1.4 | D1 | the new organisation is listed under Onboarding |
| D2.1 | D2 | the new first admin opens the invitation (token shown by the dialog on the local stack), sets a password, signs in, sees `setup-checklist`. Skipped (with a note) when the dialog shows no token |
| D3.1 | D3 | 22 Admin Center pages as Amira Khan, then a member profile, with the error checks |
| D3.2 | D3 | every item of the `nav[aria-label="Main"]` menu is opened; none may show a refusal text or leave its path |
| D4.1 | D4 | Amira opens People, Projects, Sign and Desk in the products app |
| D4.2 | D4 | Bilal Ahmed opens People, Projects, Desk; Sign ends at `/403` (expected, muted for that page) |
| D4.3 | D4 | leave: Hassan Ali approves the pending "[Demo] Family event" request of Bilal (list, All Time, View request, Approve) |
| D4.4 | D4 | Projects: Bilal moves "Implement contact and lead forms" between In Progress and In Review (toggles, so a rerun works) |
| D4.5 | D4 | Desk: Yusuf Rahman moves "Cannot connect to the office VPN" to In Progress and resolves it with a summary |
| D5.1 | D5 | Amira revokes the Engineering department rule of Projects in Apps; Noah Wilson (signed in) must reach `/403` within `DEMO_REVOKE_SECONDS` (10); the rule is then restored through the API with the Admin page's own token and Noah must get Projects back within 40 s |

Every step fails on page errors, console errors and API answers of 400 or more (401 ignored) on Admin `:5000` and products `:4000`. Steps D4.3 to D4.5 skip with a note when the demo item is already in its final state (earlier run); D5.1 puts its change back.

## Needs from others
- WS-A (`server/src/scripts/seed-demo.ts`, not mine): none required. Optional: write `operator: { email }` into `demo-accounts.json` (the walk reads `operator.email` when `DEMO_OPERATOR_EMAIL` is not set). The operator password must come from the shell (`DEMO_OPERATOR_PASSWORD`); the script never reads `.env`.
- Owner/Wave 3: the walk needs `DEMO_OPERATOR_EMAIL` and `DEMO_OPERATOR_PASSWORD` exported in the shell (the values `seed:operator` used).

## Found while working
- A manager cannot approve leave in the products UI: `ViewLeaveModal.jsx` shows the status control only to the legacy roles `superadmin`, `admin`, `manager`, but `accessCompat.js` maps the People product role `employee` to `Employee`, which is what Omar Farooq (Engineering manager) has in the demo. The server lets him approve (WS-B seed notes). The walk therefore uses the People administrator (Hassan Ali). Plan D4 says "manager approves": either the UI should offer the control to a direct manager, or the check should read "People administrator approves". Not mine to change; owner decision.
- The Projects product is named "Dictate" in the Admin product catalog (`server/src/lib/productCatalog.ts`) and in the member Product access tab, but "Project Portal" elsewhere. The walk finds its card by `data-testid="product-card-projects"`, not by name.
- Access removal by the owner of Admin Center is by assignment rule: removing one member's Projects access means revoking the rule that grants it (a department rule here), which affects the whole department. The walk restores the rule at the end; if the walk dies half-way, re-create "Engineering -> Projects, role team_member" in Apps.

## Tests written, not run
- `client/e2e-real/demo-walk.mjs` (a script, not a Playwright spec). Selectors were read from the code of both apps, not from a run, so the first Wave 3 run may need small fixes (most likely: the "Date:" popover button, the row action `aria-label="View request"`, the Desk ticket row click).
