# Admin Center: who may do what

Two layers decide access in this portal. **Org roles** (coarse, per route, `requireRole`) say who may call an administration endpoint. **Product roles** (App Access) say what a member may do inside People, Projects, Sign, Desk and later products; Admin decides them and products enforce them. Sign-in rules (who may authenticate at all): `../identity/ACCESS.md`.

## Route guard groups

`PERMISSION_GROUPS` in `server/src/constants/roles.ts`, checked by `requireRole` against `req.user.user_role`:

| Group | Roles |
|---|---|
| `SUPER_ADMINS` | Super Admin |
| `ROLE_ADMINS` | Super Admin, HR Admin, Ops Admin |
| `PEOPLE_ADMINS` | Super Admin, Admin, HR, HR Admin |
| `OPS_ADMINS` | Super Admin, Admin, Ops Admin |
| `IT_ADMINS` | Super Admin, Admin, IT Admin |
| `INSIGHT_ADMINS` (local to `intelligence.routes.ts` and `overview.routes.ts`) | Super Admin, Admin, HR Admin, IT Admin, Ops Admin |

The access of each endpoint is the Access column of `API.md`; `auth` there means any signed-in member of the organisation. Decision G9 (meta repo): the menu mirrors the server's guards; server guards are not widened to match the seeded permissions without an owner decision.

## Org roles (coarse, route level)

- Names: `server/src/constants/roles.ts` `ROLES`: Super Admin, HR Admin, IT Admin, Ops Admin, Admin, HR, Manager, Employee, Technician.
- System roles actually seeded per org by `seedSystemRoles` (`server/src/lib/seed.ts`): Super Admin, HR Admin, IT Admin, Ops Admin, Manager, Employee. `Admin`, `HR` and `Technician` appear in `PERMISSION_GROUPS` but are not seeded; a member only has them if a custom role with that exact name exists.
- How `req.user.user_role` is set (`server/src/middleware/auth.ts`): all `UserRole` assignments of the member in the org are loaded, sorted by `rankOf` (`server/src/lib/roleHierarchy.ts`), and the highest name is used. Default `Employee`. Cached in `rbacCache` (TTL `RBAC_CACHE_TTL_MS`, default 30 s).
- Ranks (`ROLE_RANK`): Super Admin 100, IT Admin 80, HR Admin 80, Ops Admin 70, Admin 60, HR 50, Manager 20, Technician 10, Employee 0; custom roles 60.
- `requireRole(list)` compares that one name against the list (exact string match).

## Granular permissions (fine, inside some handlers and the UI)

- Key format: `module:action:data_scope` (`server/src/lib/rbac.ts`). Actions: create, read, update, delete, export. Scopes: own, department, all. Deny overrides grant across a member's roles.
- Seeded modules (`server/src/lib/seed.ts` `seedPermissions`): organization, people, roles, apps, policies, workflows, locations, security, data_fields, notifications, integrations, audit_logs, insights.
- Server call sites of `hasPermission`: `people:export:all` (`people.controller.ts`), `audit:export:all` (`auditLogs.controller.ts`), `company:export:all` (`holidays.controller.ts`).
- Client: `GET /auth/my-permissions` feeds `useMyPermissions` / `useHasPermission` and `components/ui/PermissionGate.tsx`.

## Product roles (App Access)

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

## Permission matrix (role x action, summary)

| Action | Super Admin | HR Admin | IT Admin | Ops Admin | Admin | HR | Manager / Employee |
|---|---|---|---|---|---|---|---|
| Invite, edit, lifecycle, offboard members (`PEOPLE_ADMINS`) | yes | yes | no | no | yes | yes | no |
| Reset a member's MFA, force logout, sessions, IP restrictions, identity providers, assign App Access (`IT_ADMINS`) | yes | no | yes | no | yes | no | no |
| Departments, teams, groups, roles (`ROLE_ADMINS`) | yes | yes | no | yes | no | no | no |
| Locations, holidays, work schedules, policies, workflows (`OPS_ADMINS`) | yes | no | no | yes | yes | no | no |
| Delete a group or role (`SUPER_ADMINS`) | yes | no | no | no | no | no | no |
| Company settings | yes | no | no | no | yes | no | no |
| Audit log read | yes | no | yes | no | no | no | no |
| Read lists (members, groups, teams, apps, policies) | any signed-in member | | | | | | |

`Admin`, `HR` and `Technician` are not seeded roles; a member holds them only through a custom role with that exact name. Seeded system roles: Super Admin, HR Admin, IT Admin, Ops Admin, Manager, Employee (`seedSystemRoles` in `server/src/lib/seed.ts`).

## Role-grant limits

`assertCanAssignRoles` (`server/src/lib/roleHierarchy.ts`): no self-changes, no managing members who outrank you, no granting roles above your rank, only a Super Admin grants Super Admin. A group that an active App Access rule targets cannot be deleted (409 `GROUP_IN_USE`, decision D-5). The last-platform-admin rule is operator-side (`../command-center/ACCESS.md`).

## Data scope

| Scope | Where |
|---|---|
| Tenant | Every query filters on `company_id: req.user.company_id` and looks records up by `_id` **and** `company_id` (`ARCHITECTURE.md`, "Tenant scoping") |
| Own / department / all | Granular permission scopes `module:action:scope`, enforced in a few handlers (the `hasPermission` call sites above) and in the UI (`PermissionGate`) |
| Self | `GET /people/:id/effective-settings`, `/reporting-line` and policy acknowledgements are open to any signed-in member |

## What `read_only` can and cannot do

`read_only` is a **product role** (rank 5) in every product catalog. It lets a member open the product and read; the product's server refuses writes. Admin only assigns it; it never grants any Admin Center permission. The platform has no top-level auditor role (decision C-2).

## Security invariants and the tests that prove them

| Invariant | Test |
|---|---|
| Every new `company_id` collection is isolated: another company cannot read, revoke or resend an invitation; subscriptions show only their own seats | `smoke:sprint2` 7.3 isolation block |
| Role grants obey the hierarchy; `requireRole` uses exact role names | `server/src/lib/__tests__/security-baseline.test.ts` |
| Static route paths are not shadowed by `/:id` | `server/src/routes/__tests__/routeOrder.test.ts` |
| Product access follows effective access (assignments, entitlement) | `smoke:sprint2` E3 and E4a blocks; `server/src/lib/__tests__/groupAccess.test.ts` |
| MFA reset: 401, 403, cross-tenant 404, hierarchy 403 | `server/src/controllers/__tests__/mfaReset.test.ts` |
| Product keys are data, not literals in server code | `server/src/lib/__tests__/productKeyGuard.test.ts` |
| Identity-provider activation needs a verified domain and operator approval | `server/src/controllers/__tests__/identityProviders.test.ts` |
