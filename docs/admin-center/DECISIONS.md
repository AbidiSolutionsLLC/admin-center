# Admin Center: decisions

Append-only, newest last. Product-level decisions only; platform-wide decisions are in the meta repo `docs/DECISIONS.md`. Older reasoning: the git tag `docs-before-standard` of this repo and the meta repo `docs/archive/`.

| Date | ID | Context | Decision | Consequence | Decided by |
|---|---|---|---|---|---|
| 2026-11-11 | D-5 | Deleting a group could silently remove access | Deleting a group that an active App Access rule targets returns 409 `GROUP_IN_USE` | Admins remove the rule first | Owner |
| 2026-11-13 | C-2 | Need for an auditor role | No top-level auditor role in V1; each product's `read_only` role is used | `read_only` exists in every catalog | Owner |
| 2026-11-13 | C-3 | Desk should be available to everyone | Desk-entitled organisations get the default rule "All Members to Desk requester" | `ensureDefaultAccess` in operator provisioning | Owner |
| 2026-11-16 | S-5 | Seat limits were stored and not enforced | Seats are enforced when an assignment is made (409 `SEAT_LIMIT_REACHED`); existing access is never removed; growth through dynamic groups is reported, not blocked | `lib/seats.ts`, `assignApp`, `updateAssignment` | Owner |
| 2026-11-16 | S-11 | Two design languages | Products keep their design; Admin Center and Command Center share the dark Admin design through one kit and three page templates; no colour changes | `../../DESIGN.md` | Owner |
| 2026-11-16 | 3.3 | Design kit scope | `Combobox` and `DatePicker` were not built (no screen needs them); `FormField`, `Textarea`, `Select` were; the `StatusBadge` restyle (dot and word) applies to all callers | Add them when a screen needs one | Plan |
| 2026-11-16 | 5.1 | Menu read the legacy role | Navigation uses seeded permission keys, plus `roles` mirroring a server `requireRole` list where the router is still role-guarded; no External page exists | Page buttons on Apps, Groups, Roles, Teams still use the legacy role (`STATUS.md`) | Plan |
| 2026-11-16 | 5.2 | Terminating a session | `terminateSession` uses `revokeSessionsTx` and `destroyProviderSession` with the audit row and security event in one transaction (the `forceLogoutUser` pattern), not `revokeSession` | Audit entry and revocation commit together | Plan |
| 2026-11-16 | 5.3 | Exports always returned 403 for built-in roles | The audit exports check the seeded `audit_logs:export:all`; the holiday export checks `locations:export:all`; no new permission module | Only Super Admin can export the audit log in practice (routes need Super Admin or IT Admin) | Plan |
| 2026-11-16 | 5.4 | Subscription and effective-access shapes | `GET /organization/subscription` gained `products`, `GET /people/:id/effective-access` gained `reasons`; both additive. "People assigned" on a card is the stored `SeatUsage` count | | Plan |
| 2026-11-16 | 5.5 | `Company` has no `plan_key` | The tenant's plan is the plan that most plan-sourced entitlements came from; `getSubscription` also returns `trial_ends_at` and each entitlement's `expires_at` | | Plan |
| 2026-11-16 | 5.7 | `Company.setup_progress` is declared and never read or written | The checklist is derived from live data (`checklist` on `GET /overview/setup-progress`); the field stays unused; "skip" is per browser | Fixed 2026-11-17: the "assign apps" step ignores the default "All Members" group | Owner |
| 2026-11-16 | 5.8 to 5.10 | Template roll-out scope | Only page files and `pages/*/components` were restyled; `client/src/features/*` was not touched; `index.css` gained `--accent-*` variables | About 600 off-theme class uses remain | Plan |
| 2026-11-16 | 5.11 | Entra account linking | See `../identity/DECISIONS.md` (first-sign-in linking only); `member.updated` is emitted for active, probation and on_leave transitions (additive) | | Owner |
| 2026-11-17 | 7.4 | `GET /people` had no paging (2.7 MB in 25 s at 5,000 members) | Cursor paging, default `limit` 50, at most 200, `meta` with `total` and `counts_by_state` on the first page; new `User` index. `useUsers` reads every page so screens behave as before | A caller that sent no `limit` now gets 50; People page paging is ADM-023 | Owner |
| 2026-11-17 | C1 (plan 04) | Menu items shown for roles the server rejects | The menu mirrors the server's guards; no server guard is widened (platform decision G9) | `NavItem.roles` in `navigation.ts` | Owner |
