# Admin Center: data model

All models are Mongoose models in `server/src/models/`, exported from `server/src/models/index.ts`. Collection names are Mongoose defaults (lower-case plural of the model name: `User` is `users`, `AppAssignment` is `appassignments`), except the `oidc_<realm>_<Model>` collections described in `../identity/DATA-MODEL.md`. Admin owns every field here. Products never write them; they receive members, access and structure through events and the Platform API (`../platform-api/API.md`).

**Tenant key:** `company_id` on every tenant model. A lookup is always by `_id` **and** `company_id`. Global documents (no `company_id`): system product `App` rows, `ProductRole`, `Plan`, `Permission`, `OperatorAccount`, `OperatorAuditEvent`, platform event subscription and lease documents.

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
| `OrganizationEntitlement` | `company_id`, `product_key`, `status` (`active`/`suspended`), `seats_limit` (enforced when an assignment is made, decision S-5), `source` (`plan`/`operator`/`seed`), `plan_key` | Unique per (company, product) |
| `Plan` | `key`, `name`, `products[]`, `status` | Global; managed by operators |
| `AuditEvent` | `company_id`, `actor_id`, `actor_email`, `action`, `module`, `object_type`, `object_id`, `before_state`, `after_state`, `source` (`admin`/`operator`), `correlation_id` | |
| `SecurityEvent`, `SecurityPolicy`, `IpRestriction`, `IdentityProviderConnection` | | Security area |
| `Session` | `_id` = OIDC `sid`, `member_id`, `identity_id`, `company_id`, `realm`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoked_reason`, `amr` | Revocation source of truth for `requireAuth` |
| `StreamTicket` | `ticketHash`, `member`, `company`, `sid`, `expiresAt` (TTL index) | SSE tickets |
| `RefreshToken` | legacy | No sign-in path creates rows; lifecycle and organisation status changes still mark existing rows revoked (`people.controller.ts`, `operator/routes.ts`) |
| Others | `HolidayCalendar`, `Holiday`, `HolidayAssignment`, `WorkSchedule`, `WorkScheduleAssignment`, `PolicyVersion`, `PolicyAssignment`, `PolicyAcknowledgment`, `PolicyTemplate`, `AccessControlPolicy`, `DataGovernancePolicy`, `Workflow`, `WorkflowStep`, `WorkflowRun`, `WorkflowTemplate`, `ApprovalRequest`, `CustomField`, `CustomFieldVersion`, `ProfileLayout`, `FieldPermission`, `Integration`, `IntegrationSyncLog`, `NotificationTemplate`, `NotificationEvent`, `InAppNotification`, `Insight`, `Invitation`, `PasswordResetToken` | Feature-specific |

## Indexes and rules worth knowing

| Item | Rule |
|---|---|
| `User` | Index `{ company_id, created_at: -1, _id: -1 }` for cursor paging of `GET /people` |
| `OrganizationEntitlement` | Unique per (`company_id`, `product_key`); `status` is `active`, `suspended` or `restricted` (a plan change removed it: access off, data kept); `source` is `plan`, `operator` or `seed` |
| `App` slug | The intended unique index for system apps cannot be built by MongoDB (`partialFilterExpression` with `$exists: false`); uniqueness is not enforced by an index (`STATUS.md`) |
| `AuditEvent` | Retention per company (`Company.settings.audit_log_retention_days`, job `server/src/lib/auditRetention.ts`) |
| Members | Never hard-deleted: `DELETE /people/:id` moves the member to `archived`. Lifecycle: invited, onboarding, active, probation, on_leave, deactivated, terminated, archived |
| `Invitation` | Kept records with states; no TTL index (`../identity/DATA-MODEL.md`) |
| `StreamTicket` | TTL index on `expiresAt` |

## Field ownership

| Data | Written by |
|---|---|
| `Company.status`, `plan`, entitlements, seat limits | Operators (Command Center) and seeds only |
| Members, structure, App Access assignments, roles, settings | This portal's API (and the operator provisioning path for the first admin) |
| Product role catalogs (`ProductRole`, `App.role_catalog_version`) | Seeded by `seedProductRegistry()`; replaced by the products backend through the Platform API manifest or role-catalog PUT |
| All of the above as seen by products | Read-only projections in the products database (`MemberAccess` and others, products repo) |
