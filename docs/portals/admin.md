# Tenant Admin portal (web app + `/api/v1`)

Reference for the customer-facing Admin app. Everything here was read from the code on branch `chore/wrapup`. Paths are repo-relative. Where the code and the specs in `ecosystem-planning/phase-1-architecture` differ, the code is described.

Related docs: [identity.md](identity.md) (sign-in, tokens), [operator.md](operator.md) (Karbexa staff console), [platform-api.md](platform-api.md) (products backend API and events), [../ARCHITECTURE.md](../ARCHITECTURE.md), [../CONFIGURATION.md](../CONFIGURATION.md).

---

## 1. Purpose and users

- **Users:** members of a customer organisation (a `Company`) who hold an admin-type org role (Super Admin, HR Admin, IT Admin, Ops Admin, plus the `Admin`/`HR` names used in permission groups). Any member with an access-state lifecycle can sign in, but most write endpoints require an admin role (section 4).
- **What it does:** tenant administration. Members (invite, edit, lifecycle, offboarding, MFA reset, unlock), departments and business units, teams, locations, holiday calendars and work schedules, org roles and granular permissions, groups (static and dynamic), **App Access** (which Karbexa product and which product role each member gets), subscription view (entitlements set by operators), security (security policies, IP restrictions, identity providers / Entra, security events), audit log, policies, workflows and approvals, data fields, integrations, notifications, insights.
- **Not in this portal:** sign-in pages (hosted by the identity service, see identity.md), org provisioning and plans (operator console).

## 2. Where the code is

| Area | Path |
|---|---|
| SPA entry and routes | `client/src/main.tsx`, `client/src/App.tsx`, `client/src/constants/routes.ts` |
| Shell, nav, guards | `client/src/components/layout/AdminShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `AppLauncher.tsx`, `AuthGuard.tsx` |
| OIDC client and token handling | `client/src/lib/oidc.ts`, `client/src/lib/session.ts`, `client/src/lib/apiClient.ts`, `client/src/store/useAuthStore.ts` (memory only, no persistence) |
| Pages | `client/src/pages/<area>/*Page.tsx` |
| Feature modules (hooks + components per area) | `client/src/features/<area>/` |
| Client role constants | `client/src/constants/roles.ts` (mirror of the server's) |
| API router | `server/src/routes/index.ts` (mounted at `/api/v1` in `server/src/app.ts`) |
| Route files | `server/src/routes/*.routes.ts` |
| Controllers | `server/src/controllers/*.controller.ts` |
| Auth middleware | `server/src/middleware/auth.ts` (`requireAuth`), `server/src/middleware/requireRole.ts` |
| Role constants | `server/src/constants/roles.ts`, `server/src/lib/roleHierarchy.ts` |
| Granular permissions | `server/src/lib/rbac.ts`, `server/src/lib/rbacCache.ts`, seeding in `server/src/lib/seed.ts` |
| App Access / effective access | `server/src/controllers/apps.controller.ts`, `server/src/controllers/appAccess.controller.ts`, `server/src/lib/effectiveAccess.ts`, `server/src/lib/productCatalog.ts` |
| Transactions, audit, events | `server/src/lib/platformEvents.ts`, `server/src/lib/auditLogger.ts` |

## 3. Pages and API endpoints

### 3.1 Client routes (`client/src/App.tsx`)

Guards: `GuestGuard` redirects to `/overview` when a token is in memory. `AuthGuard` tries a refresh, else calls `startLogin()` (redirect to the tenant realm). Pages under `AuthGuard` render inside `AdminShell`.

| Route | Guard | Component |
|---|---|---|
| `/auth/callback` | none | `pages/auth/CallbackPage.tsx` |
| `/login` | Guest | `pages/auth/LoginPage.tsx` (button that starts OIDC login; shows a signed-out note when `?signed_out` is present) |
| `/forgot-password` | Guest | `pages/auth/ForgotPasswordPage.tsx` |
| `/reset-password` | Guest | `pages/auth/ResetPasswordPage.tsx` |
| `/onboarding` | Guest | `pages/auth/OnboardingPage.tsx` (invite acceptance: verifies the link on load and shows the form or one of five notices, built with `components/ui/AuthNotice.tsx`; e-mail is read-only; hooks in `features/auth/hooks/useInvitation.ts`) |
| `/` | Auth | redirect to `/overview` |
| `/overview` | Auth | `pages/overview/OverviewPage.tsx` |
| `/overview/insight-history` | Auth | `pages/overview/InsightHistoryPage.tsx` |
| `/organization`, `/organization/:id` | Auth | `pages/organization/OrganizationPage.tsx` |
| `/company/settings` | Auth | `pages/company/CompanySettingsPage.tsx` |
| `/teams` | Auth | `pages/teams/TeamsPage.tsx` |
| `/people` | Auth | `pages/people/PeoplePage.tsx` |
| `/people/:id` | Auth | `pages/people/UserDetailPage.tsx` (elevation 5.6: on the `ObjectPage` template, header with state badges, Edit action and overflow (Unlock, Resend invite, Offboard), key facts, URL-synced tabs; the Invitation panel shows on Profile for invited members; the Product access tab shows the assignments behind each role from `reasons`; includes product access tab, effective access, security panel with MFA reset, product open items) |
| `/roles`, `/roles/:id` | Auth | `pages/roles/RolesPage.tsx` |
| `/groups` | Auth | `pages/groups/GroupsPage.tsx` |
| `/apps` | Auth | `pages/apps/AppsPage.tsx` (App Access) |  <!-- 5.4: product cards show a seat meter, default role, or a locked state with the plan that includes it; the selected product has a "Why does this person have this role?" section (`features/apps/EffectiveAccessPanel.tsx`). Buttons on this page still use the legacy role checks. -->
| `/subscription` | Auth | `pages/subscription/SubscriptionPage.tsx` (read-only: plan, products, seats, trial; source `operator` is labelled "Override") |
| `/security` | Auth | `pages/security/SecurityPage.tsx` |
| `/audit-logs` | Auth | `pages/audit-logs/AuditLogsPage.tsx` |
| `/policies`, `/policies/:id` | Auth | `pages/policies/PoliciesPage.tsx` |
| `/locations` | Auth | `pages/locations/LocationsPage.tsx` (also hosts the holidays and work-schedules tabs) |
| `/locations/:id` | Auth | `pages/locations/LocationDetailPage.tsx` |
| `/holidays` | Auth | redirect to `/locations?tab=holidays` |
| `/work-schedules` | Auth | redirect to `/locations?tab=work-schedules` |
| `/data-fields` | Auth | `pages/data-fields/DataFieldsPage.tsx` |
| `/integrations` | Auth | `pages/integrations/IntegrationsPage.tsx` |
| `/workflows` | Auth | `pages/workflows/WorkflowsPage.tsx` |
| `/approvals` | Auth | `pages/workflows/ApprovalsPage.tsx` |
| `/notifications` | Auth | `pages/notifications/NotificationsPage.tsx` |

`ROUTES.TEAM_DETAIL` and `ROUTES.HOLIDAY_CALENDAR_DETAIL` are defined in `constants/routes.ts` but have no `<Route>`.

Navigation (`components/layout/navigation.ts`, `AppShell.tsx`) is cosmetic and permission-driven (elevation 5.1): each item names a seeded permission key (`module:action:scope`, or `module:action` for any scope) and shows when `/auth/my-permissions` grants it; the legacy `userRole` is no longer used. Groups follow PRD AC-10: Home, People, Organisation, Apps & Access, Security & Governance, Settings (no External page exists yet). The server enforces access independently with `requireRole`.

### 3.2 API endpoints (`/api/v1`)

Legend for the **Access** column:
- `public`: no auth middleware.
- `auth`: `requireAuth` only (any signed-in member of the org).
- Group names are `PERMISSION_GROUPS` from `server/src/constants/roles.ts`, checked by `requireRole` against `req.user.user_role`:
  - `SUPER_ADMINS` = Super Admin
  - `ROLE_ADMINS` = Super Admin, HR Admin, Ops Admin
  - `PEOPLE_ADMINS` = Super Admin, Admin, HR, HR Admin
  - `OPS_ADMINS` = Super Admin, Admin, Ops Admin
  - `IT_ADMINS` = Super Admin, Admin, IT Admin
- `INSIGHT_ADMINS` (defined locally in `intelligence.routes.ts` and `overview.routes.ts`) = Super Admin, Admin, HR Admin, IT Admin, Ops Admin.

The controller is in the file named after the mount unless the row says otherwise.

#### Health, auth, me, stream tickets

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/health` | public | inline in `health.routes.ts` |
| POST | `/auth/logout` | auth | `auth.controller.logout` (revokes the session, returns `end_session_url`) |
| POST | `/auth/setup-password` | public + `authLimiter` | `auth.controller.setupPassword` |
| POST | `/auth/request-password-reset` | public + `authLimiter` | `auth.controller.requestPasswordReset` |
| POST | `/auth/reset-password` | public + `authLimiter` | `auth.controller.resetPassword` (revokes all sessions of the identity) |
| GET | `/auth/me` | auth | `auth.controller.getMe` |
| GET | `/auth/my-permissions` | auth | `auth.controller.getMyPermissions` |
| POST | `/people/verify-invite` | public | `people.controller.verifyInviteToken` (mounted directly in `routes/index.ts`). 200 with e-mail (masked for `external`), name, organisation name; otherwise `410 INVITE_EXPIRED` / `INVITE_SUPERSEDED` / `INVITE_REVOKED`, `409 INVITE_ALREADY_USED`, `404 INVITE_NOT_FOUND` (expired and superseded carry `data.at`) |
| POST | `/people/renew-invite` | public | `people.controller.renewInvite`; `authLimiter` + 3 per invitation per day; always 202; re-sends only for an expired or superseded link whose user is still `invited` |
| POST | `/auth/setup-password` | public | Accept: one atomic consume of the invitation, password and lifecycle state in one transaction; `email` optional (must match when sent); same six outcome codes as verify |
| GET | `/me/apps` | auth | `appAccess.controller.getMyApps` (products the caller can launch) |
| POST | `/stream-tickets` | auth | `platform/streamTickets.issueStreamTicket` (single-use 60 s ticket for SSE) |
| GET | `/protected-test` | auth | inline in `routes/index.ts:70` (returns `req.user`; test route) |

#### People (`people.routes.ts`, `reportingLines.routes.ts`)

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/people` | auth | `getUsers` |
| GET | `/people/form-metadata` | PEOPLE_ADMINS | `getFormMetadata` |
| GET | `/people/export` | PEOPLE_ADMINS (+ `people:export:all` permission inside) | `exportUsers` |
| POST | `/people/invite` | PEOPLE_ADMINS | `inviteUser` |
| POST | `/people/bulk-invite` | PEOPLE_ADMINS | `bulkInviteUsers` |
| PUT | `/people/bulk-lifecycle` | PEOPLE_ADMINS | `bulkUpdateLifecycle` |
| POST | `/people/bulk-assign-role` | PEOPLE_ADMINS | `bulkAssignRole` |
| POST | `/people/bulk-assign-location` | PEOPLE_ADMINS | `bulkAssignLocation` |
| GET | `/people/:id` | auth | `getUserById` |
| GET | `/people/:id/history` | PEOPLE_ADMINS | `getUserHistory` |
| GET | `/people/:id/app-history` | PEOPLE_ADMINS | `getUserAppAccessHistory` |
| GET | `/people/:id/effective-permissions` | PEOPLE_ADMINS | `getEffectivePermissions` |
| GET | `/people/:id/effective-access` | PEOPLE_ADMINS | `appAccess.controller.getEffectiveAccess` (elevation 5.4 adds `reasons`: per granted product, the assignments that explain the role, looked up by `company_id`) |
| GET | `/people/:id/product-open-items` | PEOPLE_ADMINS | `getProductOpenItems` (proxies the products backend, see platform-api.md) |
| GET | `/people/:id/effective-settings` | auth | `getUserEffectiveSettings` |
| POST | `/people/:id/resend-invite` | PEOPLE_ADMINS | `resendInvite`; `?copy=true` issues a new invitation without e-mail and returns `data.invite_link` once (audited `user.invite_link_copied`) |
| GET | `/people/:id/invitation` | PEOPLE_ADMINS | `getUserInvitation`: latest invitation (state incl. derived `expired`, sent, expires) and latest `EmailDelivery` (status, last error); never a token |
| POST | `/people/:id/invitation/revoke` | PEOPLE_ADMINS | `revokeUserInvitation`: pending to revoked (409 `NO_PENDING_INVITATION` otherwise; audited `user.invite_revoked`) |
| PUT | `/people/:id` | PEOPLE_ADMINS | `updateUser` |
| PUT | `/people/:id/lifecycle` | PEOPLE_ADMINS | `updateUserLifecycle` |
| DELETE | `/people/:id` | PEOPLE_ADMINS | `deleteUser` (transitions to `archived`, it does not delete the document) |
| POST | `/people/:id/unlock` | PEOPLE_ADMINS | `unlockUser` |
| POST | `/people/:id/mfa-reset` | IT_ADMINS | `resetUserMfa` (clears TOTP, revokes all sessions of the identity) |
| POST | `/people/:id/assign-org` | PEOPLE_ADMINS | `organization.controller.assignUserOrg` |
| GET | `/people/:id/reporting-line` | auth | `reportingLines.controller.getReportingLine` |
| POST | `/people/:id/reporting-line/secondary` | PEOPLE_ADMINS | `addSecondaryManager` |
| DELETE | `/people/:id/reporting-line/secondary/:managerId` | PEOPLE_ADMINS | `removeSecondaryManager` |
| PUT | `/people/:id/reporting-line/primary` | PEOPLE_ADMINS | `changePrimaryManager` |

#### Organisation, company settings

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/organization` | auth | `organization.controller.getDepartments` |
| GET | `/organization/tree` | auth | `getOrgTree` |
| GET | `/organization/bu-tree` | auth | `getBUTree` |
| GET | `/organization/business-units` | auth | `getBusinessUnits` |
| GET | `/organization/health` | auth | `getOrgHealth` |
| GET | `/organization/history` | auth | `getOrgHistory` |
| GET | `/announcement` | auth | `routes/announcement.routes.ts`: the platform announcement `{ message, severity, ends_at }` or `null`, cached 60 s in the process; shown by `AnnouncementBanner` in `AppShell` (Plan 4.12) |
| GET | `/organization/subscription` | auth | `appAccess.controller.getSubscription` (org entitlements; elevation 5.4 adds `products`: one row per registry product with `entitled`, `seats_limit`, `seats_used` from the stored `SeatUsage`, `default_role`, and `included_in_plans` for a locked product; elevation 5.5 adds `plan` `{ key, name }`, `trial_ends_at`, and `expires_at` on each entitlement) |
| DELETE | `/organization/business-units/:id` | ROLE_ADMINS | `deleteBusinessUnit` |
| GET | `/organization/:id` | auth | `getDepartmentById` |
| POST | `/organization` | ROLE_ADMINS | `createDepartment` |
| PUT | `/organization/:id` | ROLE_ADMINS | `updateDepartment` |
| PUT | `/organization/:id/move` | ROLE_ADMINS | `moveDepartment` |
| DELETE | `/organization/:id` | ROLE_ADMINS | `deleteDepartment` |
| GET | `/company/settings` | Super Admin, Admin | `company.controller.getCompanySettings` |
| POST | `/company/settings/reset` | Super Admin, Admin | `resetCompanySettings` |
| PUT | `/company/settings/employee-id-format` | Super Admin, Admin | `updateEmployeeIdFormat` |
| PUT | `/company/settings/required-user-fields` | Super Admin, Admin | `updateRequiredUserFields` |
| PUT | `/company/settings/domain-enforcement` | Super Admin, Admin | `updateDomainEnforcement` |
| PUT | `/company/settings/company-name` | Super Admin, Admin | `updateCompanyName` |
| PUT | `/company/settings/timezone` | Super Admin, Admin | `updateTimezone` |
| PUT | `/company/settings/locale` | Super Admin, Admin | `updateLocale` |
| PUT | `/company/settings/default-location` | Super Admin, Admin | `updateDefaultLocation` |
| PUT | `/company/settings/audit-log-retention` | Super Admin, Admin | `updateAuditLogRetention` |
| PUT | `/company/settings/insight-sensitivity` | Super Admin, Admin | `updateInsightSensitivity` |

#### Teams, groups, roles

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/teams`, `/teams/:id`, `/teams/:id/members` | auth | `teams.controller.getTeams`, `getTeamById`, `getTeamMembers` |
| POST / PUT / DELETE | `/teams`, `/teams/:id` | ROLE_ADMINS | `createTeam`, `updateTeam`, `deleteTeam` |
| POST | `/teams/:id/members` | ROLE_ADMINS | `addTeamMember` |
| PUT / DELETE | `/teams/:id/members/:memberId` | ROLE_ADMINS | `updateTeamMember`, `removeTeamMember` |
| POST | `/teams/:id/members/bulk-remove` | ROLE_ADMINS | `removeBulkTeamMembers` |
| GET | `/groups`, `/groups/:id` | auth | `groups.controller.getGroups`, `getGroupById` |
| GET | `/groups/:id/users` | ROLE_ADMINS | `getGroupUsers` |
| POST | `/groups` | ROLE_ADMINS | `createGroup` |
| PUT | `/groups/:id` | ROLE_ADMINS | `updateGroup` |
| POST / DELETE | `/groups/:id/users` | ROLE_ADMINS | `addUsersToGroup`, `removeUsersFromGroup` |
| DELETE | `/groups/:id` | SUPER_ADMINS | `deleteGroup` |
| GET | `/roles`, `/roles/permissions/all`, `/roles/access-map`, `/roles/:id`, `/roles/:id/permissions` | auth | `roles.controller.getRoles`, `getAllPermissions`, `getAccessMap`, `getRoleById`, `getRolePermissions` |
| GET / POST | `/roles/:id/users` | ROLE_ADMINS | `getRoleUsers`, `assignRoleToUser` |
| DELETE | `/roles/:id/users/:userId` | ROLE_ADMINS | `unassignRoleFromUser` |
| POST | `/roles/simulate-permissions` | ROLE_ADMINS | `simulatePermissions` |
| POST | `/roles` | ROLE_ADMINS | `createRole` |
| PUT | `/roles/:id/permissions` | ROLE_ADMINS | `updateRolePermissions` |
| PUT | `/roles/:id` | ROLE_ADMINS | `updateRole` |
| DELETE | `/roles/:id` | SUPER_ADMINS | `deleteRole` |

Role grants are additionally limited by `server/src/lib/roleHierarchy.ts` (`assertCanAssignRoles`): no self-changes, no managing users who outrank you, no granting roles above your rank, only a Super Admin grants Super Admin.

#### Apps and App Access

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/apps` | auth | `apps.controller.getApps` |
| GET | `/apps/target/:target_type/:target_id` | auth | `getAppAssignmentsByTarget` |
| PATCH | `/apps/assignments/:id` | IT_ADMINS | `appAccess.controller.updateAssignment` (product role, `include_descendants`, reason; widening to descendants is checked against the seat limit, 409 `SEAT_LIMIT_REACHED`) |
| GET | `/apps/:id` | auth | `getAppById` |
| GET | `/apps/:id/roles` | auth | `appAccess.controller.getAppRoles` (product role catalog) |
| GET | `/apps/:id/timeline` | auth | `getAppAssignmentTimeline` |
| GET | `/apps/:id/users` | auth | `getAppUsers` |
| GET | `/apps/:id/dependencies` | auth | `checkAppDependencies` |
| POST | `/apps` | IT_ADMINS | `createApp` |
| PUT | `/apps/:id` | IT_ADMINS | `updateApp` |
| DELETE | `/apps/:id` | IT_ADMINS | `deleteApp` |
| POST | `/apps/:id/assign` | IT_ADMINS | `assignApp` (for product apps: needs an active entitlement and an assignable product role; 409 `SEAT_LIMIT_REACHED` with `details { product_key, limit, used, requested }` when it would exceed the entitlement's seat limit) |
| POST | `/apps/:id/revoke` | IT_ADMINS | `revokeApp` |

#### Security (`security.routes.ts`, `ipRestrictions.routes.ts`, `identityProviders.routes.ts`)

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/security/policies` | auth | `security.controller.getSecurityPolicies` |
| POST | `/security/policies` | IT_ADMINS | `createSecurityPolicy` |
| PUT / DELETE | `/security/policies/:id` | IT_ADMINS | `updateSecurityPolicy`, `deleteSecurityPolicy` |
| GET | `/security/events` | auth | `getSecurityEvents` |
| POST | `/security/force-logout/:userId` | IT_ADMINS | `forceLogoutUser` (revokes the member's `Session` rows) |
| GET | `/security/sessions` | IT_ADMINS | `getActiveSessions` (see Known issues) |
| DELETE | `/security/sessions/:tokenId` | IT_ADMINS | `terminateSession` (see Known issues) |
| GET | `/security/ip-restrictions/global-status` | IT_ADMINS | `ipRestrictions.controller.getGlobalIpRestrictionsStatus` |
| PUT | `/security/ip-restrictions/global-toggle` | IT_ADMINS | `toggleGlobalIpRestrictions` |
| GET / POST | `/security/ip-restrictions` | IT_ADMINS | `getIpRestrictions`, `createIpRestriction` |
| PUT / DELETE | `/security/ip-restrictions/:id` | IT_ADMINS | `updateIpRestriction`, `deleteIpRestriction` |
| GET / POST | `/security/identity-providers` | IT_ADMINS | `identityProviders.controller.getIdentityProviders`, `createIdentityProvider` |
| PATCH | `/security/identity-providers/:id` | IT_ADMINS | `updateIdentityProvider` (activating an Entra connection needs a verified domain and an operator tenant approval) |
| POST | `/security/identity-providers/:id/domains/:domain/verify` | IT_ADMINS | `verifyDomain` (DNS TXT `karbexa-verification=<token>`) |

#### Audit log

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/audit-logs/stream` | `?ticket=` (single-use stream ticket, role re-checked inside) or auth + Super Admin / IT Admin | `auditLogs.controller.streamAuditEvents` (SSE, Mongo change stream) |
| GET | `/audit-logs` | Super Admin, IT Admin | `getAuditEvents` |
| GET | `/audit-logs/export/csv` | Super Admin, IT Admin + `audit:export:all` permission inside | `exportAuditLogCSV` |
| GET | `/audit-logs/export/json` | Super Admin, IT Admin + `audit:export:all` permission inside | `exportAuditLogJSON` |
| POST | `/audit-logs/verify` | Super Admin, IT Admin | `verifyAuditLogs` |
| GET | `/audit-logs/:id` | Super Admin, IT Admin | `getAuditEventDetail` |

#### Locations, holidays, work schedules

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/locations/tree`, `/locations`, `/locations/:id`, `/locations/:id/users`, `/locations/:id/policies`, `/locations/:id/effective-settings` | auth | `locations.controller.*` |
| POST | `/locations` | OPS_ADMINS | `createLocation` |
| PUT / DELETE | `/locations/:id` | OPS_ADMINS | `updateLocation`, `deleteLocation` |
| POST | `/locations/:id/assign-policy` | OPS_ADMINS | `assignPolicyToLocation` |
| DELETE | `/locations/:id/policies/:policyVersionId` | OPS_ADMINS | `removeLocationPolicy` |
| GET | `/holidays/calendars/tree`, `/holidays/calendars`, `/holidays/calendars/:id`, `/holidays/calendars/:calendar_id/holidays`, `/holidays/calendar/:calendar_id/holiday/:holiday_id` | auth | `holidays.controller.*` |
| POST / PUT / DELETE | `/holidays/calendars`, `/holidays/calendars/:id` | OPS_ADMINS | `createHolidayCalendar`, `updateHolidayCalendar`, `deleteHolidayCalendar` |
| POST | `/holidays/calendars/:calendar_id/holidays` | OPS_ADMINS | `createHoliday` |
| PUT / DELETE | `/holidays/holidays/:holiday_id` | OPS_ADMINS | `updateHoliday`, `deleteHoliday` |
| POST | `/holidays/calendars/:calendar_id/holidays/export` | auth (+ `company:export:all` permission inside) | `exportHolidays` |
| POST | `/holidays/holidays/import` | OPS_ADMINS | `importHolidays` |
| GET | `/holidays/assignments`, `/holidays/assignments/location/:location_id` | auth | `getHolidayAssignments`, `getHolidayAssignmentsByLocation` |
| POST | `/holidays/assignments` | OPS_ADMINS | `createHolidayAssignment` |
| PUT / DELETE | `/holidays/assignments/:id` | OPS_ADMINS | `updateHolidayAssignment`, `deleteHolidayAssignment` |
| POST | `/holidays/calendars/bulk` | OPS_ADMINS | `createBulkHolidayCalendars` |
| POST | `/holidays/calendars/:calendar_id/holidays/bulk` | OPS_ADMINS | `createBulkHolidays` |
| DELETE | `/holidays/assignments/bulk` | OPS_ADMINS | `deleteBulkHolidayAssignments` (unreachable, see Known issues) |
| POST | `/holidays/holiday/move` | OPS_ADMINS | `moveHoliday` |
| GET | `/holidays/integrations/attendance/holidays`, `.../locations`, `.../all-company-holidays` | auth | `getHolidaysForAttendance`, `getLocationsWithHolidayCalendars`, `getAllCompanyHolidays` |
| GET | `/work-schedules`, `/work-schedules/:id` | auth | `workSchedules.controller.getWorkSchedules`, `getWorkScheduleById` |
| POST / PUT / DELETE | `/work-schedules`, `/work-schedules/:id` | OPS_ADMINS | `createWorkSchedule`, `updateWorkSchedule`, `deleteWorkSchedule` |
| GET | `/work-schedules/assignments` | auth | `getWorkScheduleAssignments` (unreachable, see Known issues) |
| GET | `/work-schedules/assignments/location/:location_id` | auth | `getWorkScheduleAssignmentsByLocation` |
| POST | `/work-schedules/assignments` | OPS_ADMINS | `createWorkScheduleAssignment` |
| PUT / DELETE | `/work-schedules/assignments/:id` | OPS_ADMINS | `updateWorkScheduleAssignment`, `deleteWorkScheduleAssignment` |
| GET | `/work-schedules/integrations/user-schedule/:user_id`, `/work-schedules/integrations/location-schedule/:location_id` | auth | `getUserWorkSchedule`, `getLocationWorkSchedule` |

#### Policies, workflows, approvals, templates

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/policies`, `/policies/versions`, `/policies/versions/diff`, `/policies/:id`, `/policies/:id/acknowledgments`, `/policies/:id/acknowledgment-status`, `/policies/:id/assignments` | auth | `policies.controller.*` |
| POST | `/policies/draft`, `/policies/publish`, `/policies/simulate` | OPS_ADMINS | `createDraftPolicy`, `publishPolicy`, `simulatePolicyApplication` |
| PUT | `/policies/:id/draft` | OPS_ADMINS | `updatePolicyDraft` |
| POST | `/policies/:id/archive`, `/policies/:id/rollback`, `/policies/:id/assignments`, `/policies/:id/conflict-check` | OPS_ADMINS | `archivePolicy`, `rollbackPolicy`, `saveAssignmentRules`, `conflictCheckHandler` |
| DELETE | `/policies/:id` | OPS_ADMINS | `deletePolicy` |
| POST | `/policies/:id/acknowledge` | auth | `acknowledgePolicy` |
| ALL | `/access-control-policies[/:id]` (GET, POST, PUT, DELETE) | OPS_ADMINS | `accessControlPolicies.controller.*` |
| ALL | `/data-governance-policies[/:id]` (GET, POST, PUT, DELETE) | OPS_ADMINS | `dataGovernancePolicies.controller.*` |
| ALL | `/policy-templates[/:id]` (GET, POST, PUT, DELETE) | OPS_ADMINS | `policyTemplates.controller.*` |
| GET | `/workflows`, `/workflows/versions`, `/workflows/:id`, `/workflows/:id/runs` | auth | `workflows.controller.*` |
| POST | `/workflows/trigger/lifecycle_changed` | OPS_ADMINS + PEOPLE_ADMINS | `handleLifecycleTrigger` |
| POST / PUT / DELETE | `/workflows`, `/workflows/:id`, `/workflows/:id/{publish,archive,draft,rollback,test,simulate}`, `/workflows/:id/steps[/reorder]`, `/workflows/:id/steps/:stepId` | OPS_ADMINS | `workflows.controller.*` |
| GET | `/workflow-templates`, `/workflow-templates/:id` | auth | `workflowTemplates.controller.getTemplates`, `getTemplateById` |
| POST / PUT / DELETE | `/workflow-templates`, `/workflow-templates/:id`, `/workflow-templates/:id/instantiate`, `/workflow-templates/from-workflow/:id` | OPS_ADMINS | `workflowTemplates.controller.*` |
| GET | `/approvals/pending` | auth | `approvals.controller.getPendingApprovals` |
| POST | `/approvals/:id/approve`, `/approvals/:id/reject` | auth | `approveRequest`, `rejectRequest` |

#### Data fields, integrations, notifications, insights, overview

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/data-fields`, `/data-fields/:id`, `/data-fields/:id/{usage,dependents,versions}`, `/data-fields/effective`, `/data-fields/dependency-map`, `/data-fields/layouts`, `/data-fields/layouts/:id` | auth | `dataFields.controller.*` |
| POST | `/data-fields/validate` | auth | `validateFieldValues` |
| POST / PUT | `/data-fields`, `/data-fields/:id`, `/data-fields/reorder`, `/data-fields/:id/rollback`, `/data-fields/layouts`, `/data-fields/layouts/:id` | Super Admin, Ops Admin | `dataFields.controller.*` |
| DELETE | `/data-fields/:id`, `/data-fields/layouts/:id` | Super Admin | `deleteCustomField`, `deleteProfileLayout` |
| POST | `/data-fields/:id/clear-data`, `/data-fields/seed-defaults` | Super Admin | `clearFieldData`, `seedDefaultFields` |
| GET | `/integrations`, `/integrations/:id`, `/integrations/:id/sync-logs` | auth | `integrations.controller.*` |
| POST / PUT | `/integrations/connect`, `/integrations/:id`, `/integrations/:id/field-mapping`, `/integrations/:id/sync` | Super Admin, Ops Admin | `connectIntegration`, `updateIntegration`, `updateFieldMapping`, `syncIntegration` |
| POST | `/integrations/:id/disconnect` | Super Admin | `disconnectIntegration` |
| GET | `/notifications/templates`, `/notifications/templates/variables`, `/notifications/templates/:id` | auth | `notifications.controller.*` |
| POST / PUT | `/notifications/templates`, `/notifications/templates/:id`, `/notifications/templates/:id/test` | Super Admin, Ops Admin | `createTemplate`, `updateTemplate`, `testTemplate` |
| DELETE | `/notifications/templates/:id` | Super Admin | `deleteTemplate` |
| GET | `/notifications/in-app`, `/notifications/in-app/unread-count` | auth | `getInAppNotifications`, `getUnreadCount` |
| POST | `/notifications/in-app/:id/read`, `/notifications/in-app/mark-all-read` | auth | `markAsRead`, `markAllAsRead` |
| GET | `/notifications/events` | Super Admin, Ops Admin | `getDeliveryEvents` |
| GET | `/intelligence`, `/intelligence/history` | auth | `intelligence.controller.getInsights`, `getInsightHistory` |
| POST / PUT | `/intelligence/run`, `/intelligence/:id/resolve`, `/intelligence/:id/dismiss`, `/intelligence/:id/auto-fix` | INSIGHT_ADMINS | `intelligence.controller.*` |
| GET | `/overview/stats`, `/overview/setup-progress`, `/overview/recent-activity`, `/overview/insights`, `/overview/intelligence` | auth | `overview.controller.*`, `intelligence.controller.getInsights` |
| POST / PUT | `/overview/intelligence/run`, `/overview/intelligence/:id/{resolve,dismiss,auto-fix}` | INSIGHT_ADMINS | `intelligence.controller.*` (duplicate of `/intelligence/*`) |

Response envelope for most tenant endpoints: `{ success: true, data }`; errors from `server/src/middleware/errorHandler.ts`: `{ success: false, error, code }` (plus `details` for validation errors).

### Setup checklist (elevation 5.7)

`GET /overview/setup-progress` also returns `checklist`: four steps (organisation structure, security policy edited, more than one member, an active app assignment) derived from live data, each query scoped by `company_id`; `Company.setup_progress` is not used. The Overview shows it (`features/overview/SetupChecklist.tsx`) until every step is done; "Skip for now" is remembered per browser.

### Template roll-out (elevation 5.8 to 5.10)

Pages are wrapped in the Phase 3 templates (`PageHeader`, `ListPage`, `Tabs`, `PageStates`) and off-theme colour classes in the page files are replaced by theme tokens (`bg-surface`, `text-ink`, `border-line`, `error`/`warning`/`success`/`info`); soft accents come from the `--accent-*` CSS variables in `client/src/index.css`. Feature components under `client/src/features/*` were not restyled.

- Batch 1 (5.8, built, not yet run): Security (URL-synced tabs `?tab=`), Audit log (`ListPage`; export buttons now check `audit_logs:export`, as the server does), Data fields, Approvals (`ListPage`, all five states), Integrations, Insight history (chart colours from CSS variables).
- Batch 2 (5.9, built, not yet run): Teams, Organization structure and Notifications (shared `PageHeader`, loading and error through `PageStates`), Groups and Admin roles (`ListPage` with toolbar search, all five states; roles keep the list/map toggle in the toolbar and move Simulate access to the overflow menu), Location detail (`ObjectPage`: header, status badges, key facts, URL-synced tabs).
- Batch 3 (5.10, built, not yet run; wrap only, page internals untouched): People, Policies, Workflows (shared `PageHeader`, loading and error through `PageStates`), Locations (header, loading and error of the locations tab through `PageStates`), Company settings (`PageHeader`, `PageStates`). Off-theme classes and raw hex in these page files and in `pages/*/components` are replaced; `bg-white/5` overlays became `bg-surface-alt` and `hover:bg-surface-hover`.

## 4. Roles and permissions

### 4.1 Org roles (coarse, route level)

- Names: `server/src/constants/roles.ts` `ROLES`: Super Admin, HR Admin, IT Admin, Ops Admin, Admin, HR, Manager, Employee, Technician.
- System roles actually seeded per org by `seedSystemRoles` (`server/src/lib/seed.ts`): Super Admin, HR Admin, IT Admin, Ops Admin, Manager, Employee. `Admin`, `HR` and `Technician` appear in `PERMISSION_GROUPS` but are not seeded; a member only has them if a custom role with that exact name exists.
- How `req.user.user_role` is set (`server/src/middleware/auth.ts`): all `UserRole` assignments of the member in the org are loaded, sorted by `rankOf` (`server/src/lib/roleHierarchy.ts`), and the highest name is used. Default `Employee`. Cached in `rbacCache` (TTL `RBAC_CACHE_TTL_MS`, default 30 s).
- Ranks (`ROLE_RANK`): Super Admin 100, IT Admin 80, HR Admin 80, Ops Admin 70, Admin 60, HR 50, Manager 20, Technician 10, Employee 0; custom roles 60.
- `requireRole(list)` compares that one name against the list (exact string match).

### 4.2 Granular permissions (fine, inside some handlers and the UI)

- Key format: `module:action:data_scope` (`server/src/lib/rbac.ts`). Actions: create, read, update, delete, export. Scopes: own, department, all. Deny overrides grant across a member's roles.
- Seeded modules (`server/src/lib/seed.ts` `seedPermissions`): organization, people, roles, apps, policies, workflows, locations, security, data_fields, notifications, integrations, audit_logs, insights.
- Server call sites of `hasPermission`: `people:export:all` (`people.controller.ts:2276`), `audit:export:all` (`auditLogs.controller.ts:287`, `:447`), `company:export:all` (`holidays.controller.ts:1279`).
- Client: `GET /auth/my-permissions` feeds `useMyPermissions` / `useHasPermission` and `components/ui/PermissionGate.tsx`.

### 4.3 Product roles (App Access)

App Access grants a product role per member. Catalogs are seeded by `seedProductRegistry()` in `server/src/lib/productCatalog.ts` (`npm run seed:products`) and can be replaced by the products backend via `PUT /platform/v1/apps/:productKey/role-catalog`.

| Product key | App name | Roles (key, rank) | Default |
|---|---|---|---|
| `people` | People | `people_administrator` 40, `hr` 30, `employee` 10, `read_only` 5 | `employee` |
| `projects` | Dictate | `project_administrator` 30, `project_manager` 20, `team_member` 10, `read_only` 5 | `team_member` |
| `sign` | Sign | `sign_administrator` 20, `sign_user` 10, `read_only` 5 | `sign_user` |
| `desk` | Desk | `desk_admin` 40, `support_lead` 30, `technician` 20, `requester` 10, `read_only` 5 | `requester` |

Effective access (`computeEffectiveAccess`, `server/src/lib/effectiveAccess.ts`):
1. Deny all products if the org `status` is not `active` (`ORG_SUSPENDED`), the member's lifecycle is not one of `onboarding`, `active`, `probation`, `on_leave` or `is_active === false` (`MEMBER_NOT_ACTIVE`), or the linked identity is not active (`IDENTITY_NOT_ACTIVE`).
2. Collect active `AppAssignment`s for system product apps whose target matches the member: `user`, `group` (static membership in an active group, or a dynamic group whose `dynamic_rules` equal the member's fields; empty rules match everyone), `role`, `department` and `location` (ancestors included unless `include_descendants === false`), `attribute` (`domain` or one of `department_id`, `lifecycle_state`, `employment_type`, `location_id`, `job_title`).
3. Per product: no match gives `NO_ASSIGNMENT`; no active `OrganizationEntitlement` gives `NO_ENTITLEMENT`; otherwise the **highest-ranked** role among the matched assignments wins (an assignment without `product_role_key` uses the app's `default_role_key`).

Defaults created at provisioning (operator API, `ensureDefaultAccess` in `server/src/operator/routes.ts`): an "All Members" dynamic group with rules `{}` gets each product's manifest `default_assignments` (built-in: `people → employee`, `desk → requester`), each only when the org has that entitlement active. Product keys are data: `lib/productRegistry.ts` (`listProducts`, `getProduct`, `assertProductKey`, 60-second cache) reads the `App` rows with `app_type: 'karbexa_product'`; `admin` is reserved and never assignable. Unknown keys fail with 400 `UNKNOWN_PRODUCT`. Manifest fields on `App`: `manifest_version`, `product_status`, `icon`, `product_category`, `default_assignments`; the seed writes them on first seed only (re-run `seed:products` on existing deployments).

Default plans (`DEFAULT_PLANS`): `starter` = people; `professional` = people, projects, sign; `enterprise` = people, projects, sign, desk.

## 5. Data models

All models are Mongoose models in `server/src/models/`. Collection names are Mongoose defaults (lower-case plural of the model name, for example `User` → `users`, `AppAssignment` → `appassignments`). Every tenant model carries `company_id`.

| Model (file) | Key fields | Notes |
|---|---|---|
| `Company` (`Company.model.ts`) | `name`, `slug`, `plan`, `status` (`provisioning`/`active`/`suspended`/`closed`), `is_active`, `settings.*` (timezone, locale, allowed_domains, audit_log_retention_days, ip_restrictions_enabled, ...), `employee_id_format`, `employee_id_counter` | `status` is written by operators and seeds only |
| `User` (`User.model.ts`) | `company_id`, `identity_id`, `authz_ver`, `email`, `full_name`, `employee_id`, `role` (legacy string), `lifecycle_state`, `department_id`, `location_id`, `manager_id`, `secondary_manager_ids`, `employment_type`, `custom_fields`, `locked_until`, `is_active` | A membership. Lifecycle: invited, onboarding, active, probation, on_leave, deactivated, terminated, archived |
| `Identity` | `email` (unique), `password_hash`, `mfa.{totp_secret_enc,totp_enabled,recovery_codes_hash}`, `federated_links[]`, `status` | Global login identity, see identity.md |
| `Role`, `UserRole`, `Permission`, `RolePermission` | role `name`, `type` (`system`/`custom`); `UserRole{user_id, role_id, company_id}`; `Permission{module, action, data_scope}` | Org roles and granular permissions |
| `Group`, `GroupMember` | `type` (`static`/`dynamic`), `dynamic_rules`, `is_active`; `GroupMember{group_id, user_id}` | |
| `Department`, `Location`, `Team`, `TeamMember` | `parent_id` trees, managers | |
| `App` | `slug`, `app_type` (`karbexa_product`/`third_party`), `product_key`, `launch_url`, `default_role_key`, `role_catalog_version`, `is_system_app`, `company_id` (absent for global system apps) | |
| `AppAssignment` | `app_id`, `target_type` (`role`/`department`/`group`/`user`/`attribute`/`location`), `target_id`, `attribute_name`, `attribute_value`, `product_role_key`, `include_descendants`, `is_active`, `granted_by`, `revoked_at` | The App Access grant |
| `ProductRole` | `product_key`, `key`, `name`, `rank`, `is_default`, `assignable`, `catalog_version` | Global (no `company_id`) |
| `OrganizationEntitlement` | `company_id`, `product_key`, `status` (`active`/`suspended`), `seats_limit` (recorded, not enforced), `source` (`plan`/`operator`/`seed`), `plan_key` | Unique per (company, product) |
| `Plan` | `key`, `name`, `products[]`, `status` | Global; managed by operators |
| `AuditEvent` | `company_id`, `actor_id`, `actor_email`, `action`, `module`, `object_type`, `object_id`, `before_state`, `after_state`, `source` (`admin`/`operator`), `correlation_id` | |
| `SecurityEvent`, `SecurityPolicy`, `IpRestriction`, `IdentityProviderConnection` | | Security area |
| `Session` | `_id` = OIDC `sid`, `member_id`, `identity_id`, `company_id`, `realm`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoked_reason`, `amr` | Revocation source of truth for `requireAuth` |
| `StreamTicket` | `ticketHash`, `member`, `company`, `sid`, `expiresAt` (TTL index) | SSE tickets |
| `RefreshToken` | legacy | Not written anywhere in `server/src` (see Known issues) |
| Others | `HolidayCalendar`, `Holiday`, `HolidayAssignment`, `WorkSchedule`, `WorkScheduleAssignment`, `PolicyVersion`, `PolicyAssignment`, `PolicyAcknowledgment`, `PolicyTemplate`, `AccessControlPolicy`, `DataGovernancePolicy`, `Workflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowTemplate`, `ApprovalRequest`, `CustomField`, `CustomFieldVersion`, `ProfileLayout`, `FieldPermission`, `Integration`, `IntegrationSyncLog`, `NotificationTemplate`, `NotificationEvent`, `InAppNotification`, `Insight`, `Invitation`, `PasswordResetToken` | Feature-specific |

## 6. Platform events emitted

All are written with `emitPlatformEvent` inside a `runInTransaction` together with the domain change and an `auditLogger.logTx` row (pattern in ARCHITECTURE.md). Actor is `{ type: 'member', id: <caller> }`.

| Event type | Emitted from | `data` |
|---|---|---|
| `member.provisioned` | `people.controller.inviteUser` (`:1144`), `bulkInviteUsers` (`:1755`) | member admin fields, `lifecycle_state: 'invited'` |
| `member.updated` | `people.controller.updateUser` (`:1457`, only when tracked fields changed), `bulkAssignLocation` (`:2192`), `transitionLifecycleTx` for active ↔ probation ↔ on_leave (elevation 5.11, `changed.lifecycle_state`) | `{ changed }` |
| `member.suspended` / `member.reactivated` / `member.terminated` | `people.controller.transitionLifecycleTx` (`:514-521`), used by `updateUserLifecycle`, `bulkUpdateLifecycle`, `deleteUser` | suspended: `lifecycle_state`, `reason`, `session_ids`; reactivated: `lifecycle_state`; terminated: `termination_date`. Mapping in `server/src/lib/lifecycle.ts` `lifecycleEventFor` |
| `app_access.changed` | `emitAppAccessChanged` / `emitAppAccessChangedBounded` from people (invite, update, lifecycle, bulk role/location), apps (`assignApp`, `revokeApp`), `appAccess.updateAssignment`, roles (`assignRoleToUser`, `unassignRoleFromUser`), groups (`updateGroup`, `deleteGroup`, `addUsersToGroup`, `removeUsersFromGroup`) | `{ authz_ver, products: { <product_key>: <role_key> } }`; bumps `User.authz_ver` first |
| `session.revoked` | `identity/sessions.revokeSessionsTx` via `security.controller.forceLogoutUser`, lifecycle transitions, MFA reset, password reset, logout | `{ sid, member_id }` |
| `org.updated` | every `company.controller` settings update (10 handlers) | the changed setting |
| `org_structure.changed` | `organization.controller` create/update/delete/move department, delete business unit; `locations.controller` create/update/delete | department or location fields |
| `calendar.changed` | `holidays.controller` calendar, holiday and assignment writes; `workSchedules.controller` schedule and assignment writes | `{ affected_location_ids }` |
| `reporting_line.changed` | `reportingLines.controller` (4 handlers) | `{ manager_id, secondary_manager_ids }` |

No platform events are emitted by: policies, workflows, data fields, integrations, notifications, IP restrictions, identity providers, security policies, teams (teams writes are transactional but emit no event).

## 7. Status

### Built ✓
- OIDC login for the SPA (PKCE, refresh rotation, single-flight refresh, proactive renewal 60 s before expiry): `client/src/lib/oidc.ts`, `client/src/lib/session.ts`.
- `requireAuth` with local RS256 verification, Session revocation check, org-suspension 423, IP restrictions: `server/src/middleware/auth.ts`.
- App Access with product roles, entitlement check, `include_descendants`, effective access view, `/me/apps` launcher, subscription page: `apps.controller.ts`, `appAccess.controller.ts`, `client/src/features/apps/productAccess.ts`, `components/layout/AppLauncher.tsx`.
- Transactional audit + platform events for people, org structure, locations, calendars, schedules, reporting lines, company settings, roles, groups, apps (section 6).
- Identity provider management with DNS TXT domain verification and Entra tenant-approval gate: `identityProviders.controller.ts`, UI `client/src/features/security/components/IdentityProvidersView.tsx`, `AddEntraModal.tsx`, `DomainVerificationCard.tsx`.
- Admin MFA reset (`POST /people/:id/mfa-reset`), UI hook `features/people/hooks/useResetMfa.ts`.
- Product open-items proxy for offboarding (`GET /people/:id/product-open-items`), UI hook `features/people/hooks/useProductOpenItems.ts`.
- Audit SSE stream with single-use tickets, 30 s session re-check (`STREAM_RECHECK_MS`): `auditLogs.controller.streamAuditEvents`, `platform/streamTickets.ts`.

### Not built or partial ✗
- ~~**No `member.updated` for active ↔ probation ↔ on_leave.**~~ **Fixed in elevation 5.11** (built, not yet run). `transitionLifecycleTx` (`people.controller.ts`) now emits `member.updated` with `data.changed.lifecycle_state` for transitions between `active`, `probation` and `on_leave` (additive: the event type and `changed` shape already existed; `lifecycleEventFor` is unchanged and still returns `null` for them).
- **Audit SSE has no client consumer.** No code in `client/src` calls `/stream-tickets` or `/audit-logs/stream`.
- **Policies, workflows, data fields, integrations, IP restrictions, identity providers** do not use `runInTransaction` (0 call sites in those controllers) and emit no platform events.
- **Seats:** `OrganizationEntitlement.seats_limit` is stored and shown but not enforced (comment in `OrganizationEntitlement.model.ts`).

### Known issues
- ~~**Security → Active sessions is dead.**~~ **Fixed in elevation 5.2** (built, not yet run). `getActiveSessions` lists live tenant-realm `Session` rows of the company (not revoked, idle and absolute expiry in the future); `terminateSession` takes the session id (`sid`), looks it up by `company_id`, and revokes it with `revokeSessionsTx` (reason `admin_terminated`, `session.revoked` event, security event, audit `security.session_terminated`, then provider teardown), as `forceLogoutUser` does. The response keeps its old field names (`ip_address`, `user_agent`, `last_activity_at`).
- ~~**Audit-log export and holiday export always return 403 for built-in roles.**~~ **Fixed in elevation 5.3** (built, not yet run). The two audit exports now check the seeded `audit_logs:export:all` (`auditLogs.controller.ts`) and the holiday export checks `locations:export:all` (`holidays.controller.ts`); no new permission module was added. Super Admin holds both; HR Admin holds `audit_logs` export and Ops Admin holds `locations` export, but the audit routes still require Super Admin or IT Admin (`requireRole`), and IT Admin has audit read only, so in practice only Super Admin exports the audit log.
- **`GET /work-schedules/assignments` is unreachable.** `router.get('/:id')` (`server/src/routes/workSchedules.routes.ts:34`) is registered before `router.get('/assignments')` (`:42`), so the request is handled by `getWorkScheduleById` with id `assignments` and fails (CastError → 404). The client calls it in `client/src/features/work-schedules/hooks/useWorkScheduleAssignments.ts:17`.
- **`DELETE /holidays/assignments/bulk` is unreachable.** `DELETE /assignments/:id` (`server/src/routes/holidays.routes.ts:68`) is registered before `/assignments/bulk` (`:73`).
- **UI role vs enforced role can differ.** The SPA takes `userRole` from `GET /auth/me`, which returns the legacy `User.role` field (`auth.controller.ts` `getMe`, `client/src/lib/session.ts` `loadProfile`). The server enforces the highest-ranked `UserRole` assignment. Menus can therefore show or hide items the server would treat differently.
- Login-time IP restriction evaluation uses the member's first `UserRole` (`UserRole.findOne` in `auth.controller.ts` `evaluateLoginIpPolicy`), while `requireAuth` uses the highest-ranked role id.
- Debug leftovers: `console.log('ROLES ROUTES LOADED')` (`server/src/routes/roles.routes.ts:23`), `GET /api/v1/protected-test` (`server/src/routes/index.ts:70`).
- `CastError` on `_id` is reported as `"User not found"` for every model (`server/src/middleware/errorHandler.ts`, branch 5).

## 8. Tests and how to run them

All commands run from `server/` unless stated. Tests use `mongodb-memory-server` (in-memory, no external DB).

| Command | What it covers for this portal |
|---|---|
| `npm test` | Node test runner over `src/**/__tests__/*.test.ts` (sequential). Relevant files: `controllers/__tests__/identityProviders.test.ts`, `mfaReset.test.ts`, `openItemsProxy.test.ts`, `streamTickets.test.ts`; `lib/__tests__/groupAccess.test.ts`, `security-baseline.test.ts`, `standaloneMongo.test.ts`, `trustProxy.test.ts` |
| `npm run smoke:sprint2` | In-process app + in-memory replica set. Sections: E3 effective access, E4a tenant assignment create/update/revoke → `app_access.changed`, atomic rollback, L3-2 group propagation, E4b tenant mutations emit domain + AuditEvent + PlatformEvent atomically, E4c teams transactional, E4d lifecycle guard, A3-1 Identity Providers API + DNS verification |
| `npm run smoke:login` | Login + Admin API auth (see identity.md) |
| `npm run test-datafield-validation` | Pure-function tests for custom field validation (`src/scripts/test-datafield-validation.ts`) |
| `npm run test-datafield-api` | Data Fields API against an in-memory Mongo (`src/scripts/test-datafield-api.ts`) |
| `npm run test-ip-restrictions` | `src/scripts/test-ip-restrictions.ts` |
| `npm run typecheck` | `tsc --noEmit` |

Client (`client/`): there is no unit-test script. Available checks: `npm run typecheck` (`tsc -b`), `npm run lint`, `npm run build`. `@playwright/test` is a dev dependency but no Playwright config or spec exists in `client/`.
