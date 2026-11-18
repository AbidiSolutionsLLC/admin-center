# Admin Center: endpoints (`/api/v1`)

Every tenant-API endpoint, grouped by resource. The router is `server/src/routes/index.ts`, mounted at `/api/v1` in `server/src/app.ts`; route files are `server/src/routes/*.routes.ts`; the guard of each area is applied in its route file. This file changes in the same commit as any route change.

Sign-in protocol endpoints (OIDC, hosted pages) are in `../identity/API.md`. Operator and Platform endpoints are in `../command-center/API.md` and `../platform-api/API.md`. Events emitted by the writes below: `../platform-api/API.md` (event catalogue).

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
| POST | `/auth/setup-password` | public + `authLimiter` | `auth.controller.setupPassword`. Accept: one atomic consume of the invitation, password and lifecycle state in one transaction; `email` optional (must match when sent); same six outcome codes as verify |
| POST | `/auth/request-password-reset` | public + `authLimiter` | `auth.controller.requestPasswordReset` |
| POST | `/auth/reset-password` | public + `authLimiter` | `auth.controller.resetPassword` (revokes all sessions of the identity) |
| GET | `/auth/me` | auth | `auth.controller.getMe` |
| GET | `/auth/my-permissions` | auth | `auth.controller.getMyPermissions` |
| POST | `/people/verify-invite` | public | `people.controller.verifyInviteToken` (mounted directly in `routes/index.ts`). 200 with e-mail (masked for `external`), name, organisation name; otherwise `410 INVITE_EXPIRED` / `INVITE_SUPERSEDED` / `INVITE_REVOKED`, `409 INVITE_ALREADY_USED`, `404 INVITE_NOT_FOUND` (expired and superseded carry `data.at`) |
| POST | `/people/renew-invite` | public | `people.controller.renewInvite`; `authLimiter` + 3 per invitation per day; always 202; re-sends only for an expired or superseded link whose user is still `invited` |
| GET | `/me/apps` | auth | `appAccess.controller.getMyApps` (products the caller can launch) |
| POST | `/stream-tickets` | auth | `platform/streamTickets.issueStreamTicket` (single-use 60 s ticket for SSE) |
| GET | `/protected-test` | auth | inline in `routes/index.ts` (returns `req.user`; debug route, see `STATUS.md`) |

#### People (`people.routes.ts`, `reportingLines.routes.ts`)

| Method | Path | Access | Handler |
|---|---|---|---|
| GET | `/people` | auth | `getUsers`: newest first, paged. Query: `limit` (default 50, at most 200), `cursor` (the previous page's `meta.next_cursor`), plus the filters `lifecycle_state`, `department_id`, `employment_type`, `search`. `meta` = `{ limit, next_cursor }` and, on the first page only, `total` (rows matching the filters) and `counts_by_state` (the whole company). An invalid cursor is 400 |
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
| GET | `/security/sessions` | IT_ADMINS | `getActiveSessions` (live tenant `Session` rows of the company) |
| DELETE | `/security/sessions/:tokenId` | IT_ADMINS | `terminateSession` (takes the session id `sid`, looked up by `company_id`) |
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
| DELETE | `/holidays/assignments/bulk` | OPS_ADMINS | `deleteBulkHolidayAssignments` (registered before `/assignments/:id`; `routeOrder.test.ts`) |
| POST | `/holidays/holiday/move` | OPS_ADMINS | `moveHoliday` |
| GET | `/holidays/integrations/attendance/holidays`, `.../locations`, `.../all-company-holidays` | auth | `getHolidaysForAttendance`, `getLocationsWithHolidayCalendars`, `getAllCompanyHolidays` |
| GET | `/work-schedules`, `/work-schedules/:id` | auth | `workSchedules.controller.getWorkSchedules`, `getWorkScheduleById` |
| POST / PUT / DELETE | `/work-schedules`, `/work-schedules/:id` | OPS_ADMINS | `createWorkSchedule`, `updateWorkSchedule`, `deleteWorkSchedule` |
| GET | `/work-schedules/assignments` | auth | `getWorkScheduleAssignments` (registered before `/:id`; `routeOrder.test.ts`) |
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
