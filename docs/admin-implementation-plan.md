# ADMIN CENTER — Implementation Plan
# Sprint 1 & Sprint 2 | Tayyab (Organization) + Hammad (People Identity)
# Stack: MERN — MongoDB · Express.js · React 18 · Node.js · TypeScript

> This plan is designed for AI-assisted development.
> Each ticket is written so you can paste it directly into Cursor and get working code.
> Complete and test EVERY ticket before moving to the next one.

---

## HOW TO USE WITH CURSOR

For each ticket, paste this prompt into Cursor:

```
Read admin-cursorrules.md, admin-backend-structure.md, and admin-frontend-guidelines.md.
I am [Tayyab / Hammad]. Implement [TICKET-ID]: [TICKET TITLE].
Acceptance criteria: [paste the criteria below].
```

**One ticket at a time. Test before moving on.**

---

## DEVELOPER ASSIGNMENTS

| Developer | Sprint 1 Tickets | Sprint 2 Tickets |
|---|---|---|
| **Tayyab** | T-001 to T-005 (Project Setup + Organization) | T-011 to T-015 (Roles, Apps, Overview) |
| **Hammad** | H-001 to H-005 (MongoDB Schema + People Identity) | H-011 to H-015 (Security, Audit Logs, Lifecycle) |

**Sprint 1 Duration:** 2 weeks
**Sprint 2 Duration:** 2 weeks

---

## BEFORE SPRINT 1 — ONE-TIME SHARED SETUP

*Both developers do this together on Day 1. Estimated: half a day.*

---

### SETUP-001 — Initialize Frontend (React + Vite)
**Owner:** Tayyab (Hammad clones when done)

```bash
npm create vite@latest client -- --template react-ts
cd client
npm install
```

**Install all frontend dependencies:**
```bash
# UI
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select
npm install @radix-ui/react-tooltip @radix-ui/react-popover @radix-ui/react-tabs
npm install @radix-ui/react-checkbox @radix-ui/react-separator
npm install class-variance-authority clsx tailwind-merge lucide-react
npx shadcn@latest init

# Routing
npm install react-router-dom

# State & Data
npm install @tanstack/react-query @tanstack/react-table
npm install zustand

# HTTP client
npm install axios

# Forms
npm install react-hook-form @hookform/resolvers zod

# Toasts
npm install sonner

# Org chart
npm install react-organizational-chart

# DnD (org restructure)
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Rich text (policies)
npm install @tiptap/react @tiptap/starter-kit

# Charts (dashboard)
npm install recharts

# Date
npm install date-fns

# Error tracking
npm install @sentry/react
```

**Install shadcn components:**
```bash
npx shadcn@latest add button input select dialog dropdown-menu table badge
npx shadcn@latest add card tabs tooltip popover calendar command sheet
npx shadcn@latest add alert separator skeleton progress checkbox
```

**Add Google Font in index.html:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**tailwind.config.ts:** apply design tokens from admin-frontend-guidelines.md Section 3.

**client/.env:**
```bash
VITE_API_URL=http://localhost:5000/api/v1
```

**Acceptance criteria:**
- [ ] `npm run dev` starts without errors on http://localhost:5173
- [ ] TypeScript strict mode enabled
- [ ] DM Sans font loads correctly
- [ ] Tailwind config has all design tokens from frontend-guidelines.md
- [ ] `@/` import alias configured in `vite.config.ts`

---

### SETUP-002 — Initialize Backend (Express + Node.js)
**Owner:** Hammad (Tayyab pulls when done)

```bash
mkdir server && cd server
npm init -y
npm install express mongoose cors helmet cookie-parser jsonwebtoken bcryptjs dotenv nodemailer express-rate-limit
npm install --save-dev typescript @types/node @types/express @types/mongoose @types/jsonwebtoken @types/bcryptjs @types/cors @types/cookie-parser nodemon ts-node
npx tsc --init
```

**tsconfig.json settings:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

**server/.env:**
```bash
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb+srv://...
DB_NAME=admin_center
JWT_ACCESS_SECRET=your_64_char_secret
JWT_REFRESH_SECRET=your_other_64_char_secret
EMAIL_FROM=noreply@yourdomain.com
SENDGRID_API_KEY=your_key
```

Create all folder structure from admin-cursorrules.md (server/ section).

Create skeleton files:
```
server/src/app.ts                    → Express app setup
server/src/index.ts                  → Entry point, connectDB, listen
server/src/config/db.ts              → Mongoose connect
server/src/middleware/auth.ts        → JWT middleware
server/src/middleware/errorHandler.ts
server/src/utils/AppError.ts
server/src/utils/asyncHandler.ts
server/src/lib/auditLogger.ts
server/src/lib/tokenService.ts
server/src/types/express.d.ts        → Extend req.user
```

**Acceptance criteria:**
- [ ] `npm run dev` starts server on port 5000
- [ ] MongoDB connects successfully (check console log)
- [ ] `GET /api/v1/health` returns `{ status: 'ok' }`
- [ ] TypeScript strict mode, zero compile errors
- [ ] JWT middleware correctly rejects requests without a valid token (test with Postman)

---

### SETUP-003 — AdminShell Layout (Frontend)
**Owner:** Tayyab

Build the global layout that wraps all admin pages.

**Files to create:**
- `client/src/components/layout/AdminShell.tsx`
- `client/src/components/layout/Sidebar.tsx`
- `client/src/components/layout/TopBar.tsx`

**Sidebar must:**
- Use `bg-[#0F1629]` (deep navy) background
- Show company logo placeholder at top (64px logo area)
- Render all 13 nav items from PRD Section 5
- Nav group labels: `Structure`, `People`, `Governance`, `Configuration`
- Active state: `bg-[#1E2A42] text-white border-l-2 border-[#E8870A]` — amber left-border indicator
- Inactive state: `text-[#8B95AA] hover:bg-[#1A2540] hover:text-white`
- Nav item: `h-9 flex items-center gap-2.5 px-3 rounded-md mx-2 text-[13px] font-medium`
- Bottom: user avatar + name + role badge + sign-out button

**TopBar must:**
- Background: `bg-white border-b border-[#E2E6ED]`
- Height: `h-16`
- Left: page title + breadcrumb (passed via React context or Router state)
- Right: notification bell + user avatar + name + role badge

**Acceptance criteria:**
- [ ] Sidebar renders all 13 nav items with correct lucide-react icons
- [ ] Active nav item styled correctly with amber border-left
- [ ] TopBar shows user name and role from `useAuthStore`
- [ ] Layout wraps all pages correctly in react-router `<Outlet />`
- [ ] `QueryClientProvider` and `Toaster` configured in `App.tsx`

---

### SETUP-004 — Auth Routes + JWT Middleware (Backend)
**Owner:** Hammad

**Files:**
- `server/src/routes/auth.routes.ts`
- `server/src/controllers/auth.controller.ts`
- `server/src/models/User.model.ts` (minimal, for auth — extend in H-001)
- `server/src/models/RefreshToken.model.ts`
- `server/src/middleware/auth.ts`

**Auth endpoints:**
```
POST /api/v1/auth/login          → email + password → returns access token + sets refresh cookie
POST /api/v1/auth/refresh        → reads refresh cookie → returns new access token
POST /api/v1/auth/logout         → clears refresh cookie + invalidates refresh token in DB
GET  /api/v1/auth/me             → returns current user from JWT
```

**Login flow:**
1. Validate email + password against `users` collection (bcrypt compare)
2. Check `lifecycle_state` is not 'terminated' or 'archived'
3. Sign access token (15min) + refresh token (7d)
4. Store refresh token hash in DB (`refresh_token_hash` on User document)
5. Set refresh token as httpOnly cookie (`Secure`, `SameSite: Strict`)
6. Return access token in response body + user info (id, role, company_id, name)

**Frontend login page:**
- `client/src/pages/auth/LoginPage.tsx`
- Email + password form with zod validation
- On success: store `accessToken` in `useAuthStore`, redirect to `/overview`
- Show error toast on failed login

**Acceptance criteria:**
- [ ] Login returns access token and sets httpOnly refresh cookie
- [ ] `/api/v1/auth/me` requires valid token and returns user data
- [ ] Refresh endpoint issues new access token from valid refresh cookie
- [ ] Logout clears cookie and deletes refresh token from DB
- [ ] All protected routes return 401 without a valid token
- [ ] Frontend redirects to `/login` when not authenticated
- [ ] Frontend redirects to `/overview` after successful login

---

## SPRINT 1 — TAYYAB TICKETS

---

### T-001 — Organization MongoDB Schema
**Owner:** Tayyab
**Sprint:** 1

Create the Mongoose models for the organization module.

**Models to create:**
- `server/src/models/Department.model.ts`
- `server/src/models/Company.model.ts` (if not done in setup)

**Indexes to create:**
```javascript
DepartmentSchema.index({ company_id: 1, is_active: 1 });
DepartmentSchema.index({ company_id: 1, slug: 1 }, { unique: true });
DepartmentSchema.index({ parent_id: 1 });
DepartmentSchema.index({ primary_manager_id: 1 });
```

**Seed script:** `server/src/scripts/seedDepartmentTypes.ts` — documents all valid dept types.

**Acceptance criteria:**
- [ ] `Department` model matches schema in admin-backend-structure.md
- [ ] All indexes created
- [ ] `slug` auto-generated from `name` using `slugify` utility
- [ ] `updated_at` auto-updated on every save via Mongoose timestamps

---

### T-002 — Organization API: Hooks + Routes
**Owner:** Tayyab
**Sprint:** 1

Build the Express API for the organization module.

**Backend files:**
- `server/src/routes/organization.routes.ts`
- `server/src/controllers/organization.controller.ts`

**Endpoints:**
```
GET    /api/v1/organization           → list all departments (company-scoped, paginated)
GET    /api/v1/organization/tree      → full org tree (recursive, for org chart)
GET    /api/v1/organization/:id       → single department detail
POST   /api/v1/organization           → create department
PUT    /api/v1/organization/:id       → update department
DELETE /api/v1/organization/:id       → soft-delete (set is_active: false)
```

**Frontend hooks:**
- `client/src/features/organization/hooks/useDepartments.ts`
- `client/src/features/organization/hooks/useDepartmentDetail.ts`
- `client/src/features/organization/hooks/useCreateDepartment.ts`
- `client/src/features/organization/hooks/useUpdateDepartment.ts`
- `client/src/features/organization/hooks/useDeleteDepartment.ts`
- `client/src/features/organization/hooks/useOrgTree.ts`

**Acceptance criteria:**
- [ ] All 6 endpoints work and are protected by `requireAuth`
- [ ] All queries scoped to `req.user.company_id`
- [ ] Create and update actions produce audit log entries
- [ ] Delete is soft (sets `is_active: false`) — never hard delete
- [ ] `GET /tree` returns hierarchical JSON for org chart rendering
- [ ] All frontend hooks typed correctly with no `any`

---

### T-003 — Organization UI Components
**Owner:** Tayyab
**Sprint:** 1

Build all UI components for the organization module.

**Components:**
- `client/src/features/organization/components/DepartmentTable.tsx` — TanStack Table with columns: Name + Type, Manager, Headcount, Status, Actions
- `client/src/features/organization/components/DepartmentForm.tsx` — react-hook-form + zod, used in create/edit modal
- `client/src/features/organization/components/OrgChartView.tsx` — renders the tree from `useOrgTree`
- `client/src/features/organization/components/DepartmentPanel.tsx` — slide-in panel for dept detail

**DepartmentTable columns:**
1. Name (with type badge below)
2. Manager (UserAvatar + name, or "—" if none — show warning icon if missing)
3. Headcount (right-aligned number)
4. Status (Active/Archived badge)
5. Actions (Edit, Archive — in RowActions dropdown)

**Design:** Follow admin-frontend-guidelines.md. Use design tokens only. Amber-orange for primary actions.

**Acceptance criteria:**
- [ ] Table renders with all 5 columns, correct styling per design guidelines
- [ ] Create modal opens with `DepartmentForm`, validates, submits, shows success toast
- [ ] Edit modal pre-fills form with existing data
- [ ] Org chart renders tree up to 8 levels deep
- [ ] All four states handled: loading (TableSkeleton), error (ErrorState), empty (EmptyState), data

---

### T-004 — Organization Page: Full Integration
**Owner:** Tayyab
**Sprint:** 1

Assemble the full Organization page.

**File:** `client/src/pages/organization/OrganizationPage.tsx`

**Page sections:**
1. Page header: "Organization" title + subtitle + "Create Department" primary button (amber)
2. View toggle: Table view | Org Chart view (tab or button group)
3. Filter bar: search input + type filter + status filter
4. Content: `DepartmentTable` or `OrgChartView` based on toggle

**Acceptance criteria:**
- [ ] Full CRUD works end-to-end (create, read, update, archive)
- [ ] View toggle switches between table and org chart
- [ ] Filters work correctly (search by name, filter by type, filter by status)
- [ ] Create + edit modal fully functional with validation
- [ ] Delete (archive) shows `ConfirmDialog` before proceeding
- [ ] Intelligence warnings visible on department rows with issues
- [ ] Page handles all 4 states: loading, error, empty, data

---

### T-005 — Organization: Intelligence Rules + Audit Integration
**Owner:** Tayyab
**Sprint:** 1

Wire up intelligence rules for the organization module.

**Backend:**
- Trigger intelligence rule runner from `server/src/lib/intelligence.ts` after every org mutation
- Implement RULE-02 (dept with headcount > 0, no manager) and RULE-05 (orphan team)

**Frontend:**
- Show intelligence banner on OrganizationPage when critical insights exist for org module
- Banner style: amber-bg warning banner above the table (see frontend-guidelines Section 9)
- Individual department rows show a warning dot if that specific dept has an active insight

**Audit:**
- Verify all org mutations (create, update, archive) appear in audit log with correct before/after state

**Acceptance criteria:**
- [ ] RULE-02 fires after dept is created with no manager (insight appears in DB within 60 seconds)
- [ ] RULE-05 fires for orphan teams
- [ ] Intelligence banner appears on org page when critical insights exist
- [ ] Warning dot shows on dept rows with active insights
- [ ] All org mutations visible in audit log with actor, action, before/after state

---

## SPRINT 1 — HAMMAD TICKETS

---

### H-001 — Users MongoDB Schema
**Owner:** Hammad
**Sprint:** 1

Create the full User model.

**Model:** `server/src/models/User.model.ts` (full version, extending auth setup from SETUP-004)

**Indexes:**
```javascript
UserSchema.index({ company_id: 1, lifecycle_state: 1 });
UserSchema.index({ company_id: 1, email: 1 }, { unique: true });
UserSchema.index({ company_id: 1, employee_id: 1 }, { unique: true });
UserSchema.index({ company_id: 1, department_id: 1 });
UserSchema.index({ last_login: 1 });
```

**Seed script:** Seed system roles: `super_admin`, `hr_admin`, `it_admin`, `ops_admin`, `manager`, `employee` as Role documents. Seed all permissions (each module × each action × each data_scope combination).

**Acceptance criteria:**
- [ ] `User` model matches schema in admin-backend-structure.md
- [ ] All indexes created
- [ ] System roles and all permissions seeded
- [ ] `employee_id` auto-generated using `Company.employee_id_format` + `employee_id_counter` (increment atomically using `$inc`)
- [ ] `lifecycle_changed_at` auto-updated when `lifecycle_state` changes (Mongoose pre-save hook)

---

### H-002 — People API: Routes + Controllers
**Owner:** Hammad
**Sprint:** 1

Build the People module API.

**Endpoints:**
```
GET    /api/v1/people                  → list users (company-scoped, paginated, filterable)
GET    /api/v1/people/:id              → user detail (with roles, custom_fields)
POST   /api/v1/people/invite           → invite single user (create + send welcome email)
POST   /api/v1/people/bulk-invite      → bulk invite from CSV data array (max 500 rows)
PUT    /api/v1/people/:id              → update user profile
PUT    /api/v1/people/:id/lifecycle    → change lifecycle state (validated against VALID_TRANSITIONS)
DELETE /api/v1/people/:id              → soft-archive (set lifecycle_state: 'archived')
```

**Lifecycle endpoint validation:**
```typescript
// PUT /api/v1/people/:id/lifecycle
// body: { to: LifecycleState }
// 1. Get current state from DB
// 2. Check isValidTransition(current, to) from lifecycle.ts
// 3. If invalid: throw AppError 400 'INVALID_TRANSITION'
// 4. Update state
// 5. Run lifecycle automation (see lifecycle.ts)
// 6. Audit log the transition
```

**Frontend hooks:**
- `useUsers.ts`, `useUserDetail.ts`, `useInviteUser.ts`, `useUpdateUser.ts`, `useUpdateLifecycle.ts`, `useBulkInvite.ts`

**Acceptance criteria:**
- [ ] All endpoints work and scoped to `req.user.company_id`
- [ ] Invite sends welcome email via emailService
- [ ] Lifecycle transition validates against `VALID_TRANSITIONS` — invalid transitions return 400
- [ ] Bulk invite supports 500 rows, validates each row, returns per-row success/error
- [ ] All mutations produce audit events

---

### H-003 — People UI Components
**Owner:** Hammad
**Sprint:** 1

**Components:**
- `UserTable.tsx` — columns: Name + Avatar, Employee ID, Department, Role(s), Lifecycle State, Last Login, Actions
- `UserForm.tsx` — profile edit form
- `InviteModal.tsx` — single invite (email + dept + role) + bulk invite tab (CSV upload with preview)
- `LifecycleStateSelector.tsx` — shows current state, valid next states as buttons
- `IdentityHealthBadge.tsx` — shows role/dept/login health signals as colored dots

**UserTable columns:**
1. Name (avatar + full_name + email below)
2. Employee ID (mono font, `font-mono text-xs`)
3. Department (or "—" with warning if missing)
4. Role(s) (badge list, or "No Role" with warning badge)
5. Lifecycle State (colored badge per state)
6. Last Login (relative time, or "Never")
7. Actions (View, Edit, Change State — in RowActions)

**Design:** Use design tokens from theme.ts. Lifecycle state badges use the color config from frontend-guidelines Section 7.2.

**Acceptance criteria:**
- [ ] Table renders all 7 columns with correct design
- [ ] Invite modal: single invite sends, bulk invite parses CSV, shows preview, confirms, sends
- [ ] Lifecycle state selector only shows valid transitions (from `VALID_TRANSITIONS` map)
- [ ] IdentityHealthBadge shows correct signals (green = ok, amber = warning, red = critical)
- [ ] All four page states: loading, error, empty, data

---

### H-004 — People Page + Full Integration
**Owner:** Hammad
**Sprint:** 1

**File:** `client/src/pages/people/PeoplePage.tsx`

**Sections:**
1. Page header: "People" title + "Invite User" primary button
2. Filter bar: search + lifecycle state filter + department filter + employment type filter
3. Stats row: Total | Active | Invited | On Leave | Terminated (small stat chips above table)
4. `UserTable` with pagination

**Acceptance criteria:**
- [ ] Full CRUD works (invite, view profile, edit, change lifecycle)
- [ ] All filters work and combine correctly
- [ ] Stats row reflects live counts
- [ ] Bulk invite supports 500-row CSV
- [ ] Lifecycle change fires correct automation (check email sent for invite→onboarding)

---

### H-005 — People: Intelligence Rules + Lifecycle Automation
**Owner:** Hammad
**Sprint:** 1

**Intelligence rules to implement:**
- RULE-01: Active user with no role assigned
- RULE-03: Active user with no department
- RULE-04: User last_login > 90 days and still active

**Lifecycle automations:**
```
invited → onboarding  → send welcome email (Nodemailer)
onboarding → active   → assign default role from department's role mapping
active → terminated   → invalidate refresh token + add to revocation log
terminated → archived → anonymize PII (full_name='Archived User', phone=null, avatar_url=null)
```

**Acceptance criteria:**
- [ ] All 3 intelligence rules produce correct insights
- [ ] All 4 lifecycle automations fire correctly on state transitions
- [ ] Each automation produces an audit event
- [ ] Anonymization clears all PII fields on archive
- [ ] VALID_TRANSITIONS enforced — invalid transitions return 400

---

## SPRINT 2 — TAYYAB TICKETS

---

### T-011 — Roles & Apps MongoDB Schema
**Owner:** Tayyab
**Sprint:** 2

**Models:**
- `Role.model.ts`, `Permission.model.ts`, `RolePermission.model.ts`, `UserRole.model.ts`
- `Group.model.ts`, `GroupMember.model.ts`
- `App.model.ts`, `AppAssignment.model.ts`

**Seed:** All permissions (each of 13 modules × 5 actions × 3 data_scopes = 195 permission documents). Seed 5 system apps.

**Acceptance criteria:**
- [ ] All models match admin-backend-structure.md schemas
- [ ] All indexes created
- [ ] 195 permission documents seeded
- [ ] System roles seeded with correct default permissions

---

### T-012 — Roles & Permission Matrix: API + UI
**Owner:** Tayyab
**Sprint:** 2

**Endpoints:**
```
GET    /api/v1/roles                   → list roles
GET    /api/v1/roles/:id               → role detail + permissions
POST   /api/v1/roles                   → create role
PUT    /api/v1/roles/:id               → update role meta
PUT    /api/v1/roles/:id/permissions   → batch update permissions (array of { permission_id, granted })
DELETE /api/v1/roles/:id              → delete (only if no users assigned)
GET    /api/v1/roles/:id/simulate      → resolve effective permissions for a user (permission simulator)
```

**UI components:**
- `RolesTable.tsx`
- `PermissionMatrix.tsx` — the flagship complex component (see frontend-guidelines Section 13)
- `PermissionSimulator.tsx`

**PermissionMatrix UI rules:**
- Container: `bg-white border border-line rounded-lg overflow-hidden`
- Module rows with 5 action checkboxes each
- Changes tracked in local state, saved on "Save Changes" click
- "Grant all" / "Clear all" per row
- Warn when removing 'read' while 'create' is checked

**Acceptance criteria:**
- [ ] Permission matrix saves correctly (batch update endpoint)
- [ ] RBAC engine resolves conflicts: deny overrides grant
- [ ] Permission simulator returns correct effective permissions for any user
- [ ] Role deletion blocked if users assigned (409 Conflict error)
- [ ] All mutations produce audit events

---

### T-013 — App Assignment: API + UI
**Owner:** Tayyab
**Sprint:** 2

**Endpoints:**
```
GET  /api/v1/apps                          → app catalog
POST /api/v1/apps/:id/assign               → assign app to role/group/dept/user
POST /api/v1/apps/:id/revoke               → revoke assignment
GET  /api/v1/apps/:id/assignments          → list all assignments for an app
GET  /api/v1/people/:id/apps               → all apps accessible to a user
```

**UI:**
- `AppCatalog.tsx` — card grid of apps with assignment status
- `AssignmentRuleBuilder.tsx` — assign to: Role / Group / Department / Individual
- `AccessTimeline.tsx` — per-user access history

**Acceptance criteria:**
- [ ] App assignment propagates to all users with the target role/group/dept
- [ ] App dependency warning shown in UI when dependency is unmet
- [ ] Access timeline shows full grant/revoke history
- [ ] All assignments produce audit events

---

### T-014 — Overview Dashboard: API + UI
**Owner:** Tayyab + Hammad
**Sprint:** 2

**Backend endpoints:**
```
GET /api/v1/overview/stats        → { totalUsers, activeUsers, roles, openInsights, setupProgress }
GET /api/v1/overview/insights     → all active insights, sorted by severity
GET /api/v1/overview/activity     → last 10 audit events
POST /api/v1/intelligence/run     → trigger intelligence rule runner for company
```

**UI components:**
- `HealthCard.tsx` — stat card (see frontend-guidelines Section 7.3)
- `InsightPanel.tsx` — grouped insights (critical / warning / info)
- `RecentActivityFeed.tsx` — last 10 audit events as feed
- `SetupProgressCard.tsx` — progress ring + step checklist

**Dashboard layout:**
```
Row 1: 4x stat cards (Total Users / Active Users / Roles / Open Insights)
Row 2: SetupProgressCard (left, 1/3 width) + InsightPanel (right, 2/3 width)
Row 3: RecentActivityFeed (full width)
```

**Acceptance criteria:**
- [ ] All 4 stat cards load correctly
- [ ] Setup progress reflects actual completion state across all modules
- [ ] Insights sorted by severity (critical first), grouped visually
- [ ] Insight cards have "View issue →" link and "Dismiss" action
- [ ] Dismiss updates `is_resolved: true` in DB and removes card from view
- [ ] Recent activity feed shows last 10 events with correct actor + action + time

---

### T-015 — Tayyab Sprint 2 Polish + Integration Tests
**Owner:** Tayyab
**Sprint:** 2

- [ ] Verify audit log entries for all org, roles, apps mutations
- [ ] Intelligence rules T-005 (RULE-02, RULE-05) still firing correctly
- [ ] Add intelligence rules for roles module (RULE-06: over-permissioned role)
- [ ] Fix any TypeScript errors (`npx tsc --noEmit` — zero errors)
- [ ] Test bulk invite with 50-row CSV
- [ ] Performance: People page with 100 users loads under 200ms (check Network tab)

---

## SPRINT 2 — HAMMAD TICKETS

---

### H-011 — Security MongoDB Schema
**Owner:** Hammad
**Sprint:** 2

**Models:**
- `server/src/models/SecurityEvent.model.ts`
- `server/src/models/SecurityPolicy.model.ts`

**SecurityEvent** (immutable — no update/delete routes):
```typescript
{
  company_id: ObjectId,
  user_id: ObjectId,           // nullable for failed attempts with unknown user
  email: string,
  event_type: 'login_success' | 'login_failure' | 'logout' | 'password_reset' | 'token_refresh',
  ip_address: string,
  user_agent: string,
  is_suspicious: boolean,      // true if 5+ failures in 10 minutes from same IP
  created_at: Date,
}
```

**SecurityPolicy** (one per company):
```typescript
{
  company_id: ObjectId (unique),
  min_password_length: number,   // default 8
  require_uppercase: boolean,
  require_numbers: boolean,
  require_symbols: boolean,
  password_expiry_days: number,  // 0 = never
  session_timeout_minutes: number,
  max_concurrent_sessions: number,
  mfa_required_for_roles: string[],
}
```

**Add to auth controller:** Log `SecurityEvent` on every login attempt (success and failure). Set `is_suspicious: true` if 5+ failures from same IP in last 10 minutes.

**Acceptance criteria:**
- [ ] `SecurityEvent` logged on every login attempt
- [ ] `is_suspicious` flag set correctly (test with 5 manual failures)
- [ ] `SecurityPolicy` model seeded with defaults for each company on creation

---

### H-012 — Security Module: API + UI
**Owner:** Hammad
**Sprint:** 2

**Endpoints:**
```
GET  /api/v1/security/policy          → get security policy for company
PUT  /api/v1/security/policy          → update security policy
GET  /api/v1/security/events          → paginated security events with filters
GET  /api/v1/security/sessions        → all active sessions (users with valid refresh tokens)
POST /api/v1/security/sessions/revoke → force logout a user (invalidate refresh_token_hash)
```

**Page:** `client/src/pages/security/SecurityPage.tsx`

**Tabs:**
1. **Authentication** — password policy form + MFA settings
2. **Sessions** — table of users with active sessions + force-logout button
3. **Access Log** — paginated security events, `is_suspicious` rows highlighted in red

**Acceptance criteria:**
- [ ] Security policy form saves and produces audit event
- [ ] Force logout invalidates `refresh_token_hash` in User document
- [ ] Access log shows events with suspicious rows highlighted in red
- [ ] Session timeout and MFA settings visible and editable

---

### H-013 — Audit Logs Module: API + Full UI
**Owner:** Hammad
**Sprint:** 2

**Endpoints:**
```
GET  /api/v1/audit                    → paginated audit events with filters
GET  /api/v1/audit/export             → stream CSV or JSON export
```

**Filters:** date range, actor email, module, action type, object type

**Page:** `client/src/pages/audit-logs/AuditLogsPage.tsx`

**AuditLogTable columns:**
1. Timestamp (relative "2 hours ago" + hover shows exact datetime)
2. Actor (avatar + email)
3. Action (code-style pill: `user.lifecycle_changed` — mono font, colored bg)
4. Object (type + name)
5. Module (badge)
6. Expand icon → before/after JSON diff

**Before/After diff:** Side-by-side, changed keys highlighted with amber background.

**Export:** "Export CSV" + "Export JSON" buttons — stream from `/api/v1/audit/export`. Export action itself logged in audit_events.

**Acceptance criteria:**
- [ ] Audit log table shows all events with correct columns
- [ ] All filters work and combine
- [ ] Row expand shows before/after diff
- [ ] CSV export downloads correctly (test with 1000+ rows)
- [ ] Export action itself appears in audit log

---

### H-014 — Lifecycle Engine: Full Automation
**Owner:** Hammad
**Sprint:** 2

Complete the lifecycle automation system.

**File:** `server/src/lib/lifecycle.ts`

| Trigger | Action |
|---|---|
| `invited → onboarding` | Send welcome email via emailService |
| `onboarding → active` | Assign default role (Employee) for department |
| `active → terminated` | Set `refresh_token_hash = null` + add to revocation log |
| `terminated → archived` | Anonymize: `full_name='Archived User'`, `phone=null`, `avatar_url=null` |

**Test each automation manually in order:**
1. Invite user → verify `invited` state
2. Change to `onboarding` → verify welcome email (check email logs)
3. Change to `active` → verify Employee role assigned
4. Change to `terminated` → verify refresh token invalidated
5. Change to `archived` → verify PII anonymized

**Acceptance criteria:**
- [ ] All 4 automations fire correctly
- [ ] Each automation produces an audit event
- [ ] `VALID_TRANSITIONS` enforced — invalid transitions return 400
- [ ] Anonymization correctly clears all PII fields
- [ ] User cannot log in after termination (refresh token invalid)

---

### H-015 — Hammad Sprint 2 Polish + Integration Tests
**Owner:** Hammad
**Sprint:** 2

- [ ] Verify security events logged for all login attempts
- [ ] Verify audit log captures all people module mutations
- [ ] Add intelligence rules: RULE-07 (admin with no MFA)
- [ ] Fix any TypeScript errors (`npx tsc --noEmit` — zero errors)
- [ ] Test bulk invite with 50-row CSV
- [ ] Smoke test: complete user journey invite → active → terminated → archived

---

## SPRINT 2 — END OF SPRINT CHECKLIST
*Both developers review together. This completes Phase 1.*

**Functionality:**
- [ ] Complete user journey: invite → onboarding → active → terminated → archived
- [ ] Org hierarchy: create BU → dept → team → assign manager
- [ ] Roles & permissions: create role → assign permissions → assign to user → verify access
- [ ] App assignment: assign app to role → user with that role can see the app
- [ ] Audit log captures all admin operations across all modules
- [ ] Intelligence panel shows relevant insights with correct severity
- [ ] Security module: password policy saves, force logout works

**Quality:**
- [ ] `npx tsc --noEmit` — zero TypeScript errors on both client and server
- [ ] All pages handle loading, error, empty, and data states
- [ ] No hardcoded colors anywhere (only Tailwind classes referencing design tokens)
- [ ] No missing `company_id` filters (grep for `.find(` — verify each has `company_id`)
- [ ] No direct API calls in components (all through hooks)
- [ ] All backend mutations produce audit events (grep for `asyncHandler` → verify `auditLogger.log` call)

**Performance:**
- [ ] People page with 100 users loads under 200ms (Network tab)
- [ ] Audit log with 1000 entries loads under 300ms
- [ ] MongoDB query explain shows index usage on all list endpoints

---

## TICKET SUMMARY

| Ticket | Developer | Sprint | Module |
|---|---|---|---|
| SETUP-001 | Tayyab | Pre-Sprint | Frontend Init (Vite + React) |
| SETUP-002 | Hammad | Pre-Sprint | Backend Init (Express + MongoDB) |
| SETUP-003 | Tayyab | Pre-Sprint | AdminShell Layout |
| SETUP-004 | Hammad | Pre-Sprint | Auth Routes + JWT |
| T-001 | Tayyab | Sprint 1 | Org Schema (MongoDB) |
| T-002 | Tayyab | Sprint 1 | Org API + Hooks |
| T-003 | Tayyab | Sprint 1 | Org UI Components |
| T-004 | Tayyab | Sprint 1 | Organization Page |
| T-005 | Tayyab | Sprint 1 | Org Intelligence + Audit |
| H-001 | Hammad | Sprint 1 | Users Schema (MongoDB) |
| H-002 | Hammad | Sprint 1 | People API + Hooks |
| H-003 | Hammad | Sprint 1 | People UI Components |
| H-004 | Hammad | Sprint 1 | People Page + Invite |
| H-005 | Hammad | Sprint 1 | People Intelligence + Lifecycle |
| T-011 | Tayyab | Sprint 2 | Roles/Apps Schema |
| T-012 | Tayyab | Sprint 2 | Roles + Permission Matrix |
| T-013 | Tayyab | Sprint 2 | App Assignment |
| T-014 | Tayyab | Sprint 2 | Overview Dashboard |
| T-015 | Tayyab | Sprint 2 | Polish + Tests |
| H-011 | Hammad | Sprint 2 | Security Schema |
| H-012 | Hammad | Sprint 2 | Security Module |
| H-013 | Hammad | Sprint 2 | Audit Logs UI |
| H-014 | Hammad | Sprint 2 | Lifecycle Automation |
| H-015 | Hammad | Sprint 2 | Polish + Tests |

**Total: 24 tickets across 2 sprints | Estimated: 4 weeks for 2 developers**
