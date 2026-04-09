# ADMIN CENTER — Implementation Plan
# Sprint 3 & Sprint 4 | Tayyab (Organization Completion) + Hammad (Policies, Workflows, Lifecycle Ext.)
# Stack: MERN — MongoDB · Express.js · React 18 · Node.js · TypeScript

> Continue from Sprint 1 & 2. Complete and test EVERY ticket before moving to the next one.
> Same Cursor workflow: paste each ticket prompt with admin-cursorrules.md, admin-backend-structure.md, admin-design-structure.md

---

## GAP ANALYSIS — What Sprint 1 & 2 Did NOT Cover

### From User Stories (assigned to you — gaps found)

| Story | What's Missing |
|---|---|
| **US-01** | `Team` is not a separate model — only `Department` with `dept_type`. Teams need their own schema, API, and CRUD UI |
| **US-02** | No Team CRUD UI. No assign/remove users to/from teams. No team detail view |
| **US-03** | Business Units (`dept_type: 'business_unit'`) have no dedicated CRUD, no explicit BU-level management page |
| **US-04** | User assignment covers department only. Team assignment (many-to-many) is not implemented |
| **US-05** | Drag-and-drop org restructure (node reparenting) — PRD mentions it, no ticket existed |
| **US-06** | Team-level manager assignment — only dept-level manager exists |
| **US-07** | Secondary reporting lines — `secondary_manager_id` field not in schema or UI |
| **US-08** | Org chart has basic tree render. Expand/collapse nodes + click-to-navigate not implemented |
| **US-09** | RULE-02 and RULE-05 exist but no dedicated Structural Health UI page with direct navigation to issues |
| **US-10** | AuditLog module exists but no org-scoped change history view filtered to org mutations |

### From PRD Modules Not Yet Implemented

| PRD Module | Status |
|---|---|
| 6.6 Policies | ❌ Not started |
| 6.7 Workflows & Automation | ❌ Not started |
| 6.8 Locations & Context | ❌ Not started |
| 6.10 Data & Custom Fields | ❌ Not started |
| 6.11 Notifications | ❌ Not started |
| 6.12 Integrations | ❌ Not started (MVP: 3 connectors) |

---

## DEVELOPER ASSIGNMENTS

| Developer | Sprint 3 Tickets | Sprint 4 Tickets |
|---|---|---|
| **Tayyab** | T-021 to T-025 (Teams, BU, Drag-drop, Org Health, Org History) | T-031 to T-035 (Locations, Custom Fields, Integration) |
| **Hammad** | H-021 to H-025 (Secondary Reporting, Policies Schema + API + UI) | H-031 to H-035 (Workflows, Notifications, Polish) |

**Sprint 3 Duration:** 2 weeks
**Sprint 4 Duration:** 2 weeks

---

## HOW TO USE WITH CURSOR

For each ticket, paste this into Cursor:

```
Read admin-cursorrules.md, admin-backend-structure.md, and admin-design-structure.md.
I am [Tayyab / Hammad]. Implement [TICKET-ID]: [TICKET TITLE].
Acceptance criteria: [paste the criteria below].
```

**One ticket at a time. Test before moving on.**

---

## SPRINT 3 — TAYYAB TICKETS

---

### T-021 — Teams MongoDB Schema + API
**Owner:** Tayyab
**Sprint:** 3
**Covers:** US-01, US-02, US-04, US-06

**Context:**
Sprint 1 used `Department.model.ts` for all hierarchy levels via `dept_type`. Teams are a special case — they need explicit many-to-many user membership (a user can be in multiple teams), a dedicated manager field, and their own endpoints. Create a separate `Team` model rather than overloading Department.

**Models to create:**
- `server/src/models/Team.model.ts`
- `server/src/models/TeamMember.model.ts`

**Team schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,           // required — all queries scoped to this
  name: string,                   // required
  slug: string,                   // auto-generated from name, unique per company
  department_id: ObjectId,        // required — team must belong to a department
  primary_manager_id: ObjectId | null,   // US-06: team manager
  description: string | null,
  is_active: boolean,             // soft delete
  headcount: number,              // virtual — computed from TeamMember count
  created_at: Date,
  updated_at: Date,
}
```

**TeamMember schema (join table — many-to-many: user ↔ team):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  team_id: ObjectId,
  user_id: ObjectId,
  joined_at: Date,
  role_in_team: 'member' | 'lead',   // optional distinction
}
```

**Indexes:**
```javascript
TeamSchema.index({ company_id: 1, is_active: 1 });
TeamSchema.index({ company_id: 1, department_id: 1 });
TeamSchema.index({ company_id: 1, slug: 1 }, { unique: true });
TeamSchema.index({ primary_manager_id: 1 });

TeamMemberSchema.index({ company_id: 1, team_id: 1 });
TeamMemberSchema.index({ company_id: 1, user_id: 1 });
TeamMemberSchema.index({ team_id: 1, user_id: 1 }, { unique: true }); // no duplicate membership
```

**Also update `User.model.ts`:**
Add `secondary_manager_id: ObjectId | null` field (US-07 prerequisite — Hammad will use this in H-021).

**API endpoints:**
```
GET    /api/v1/teams                        → list all teams (company-scoped, supports ?department_id= filter)
GET    /api/v1/teams/:id                    → team detail + members list
POST   /api/v1/teams                        → create team (requires department_id)
PUT    /api/v1/teams/:id                    → update team (name, description, manager, department)
DELETE /api/v1/teams/:id                    → soft delete (is_active: false) — blocked if members exist
POST   /api/v1/teams/:id/members            → add user to team { user_id, role_in_team }
DELETE /api/v1/teams/:id/members/:userId    → remove user from team
GET    /api/v1/teams/:id/members            → list members of a team
GET    /api/v1/people/:userId/teams         → all teams a user belongs to
```

**Frontend hooks:**
- `client/src/features/organization/hooks/useTeams.ts`
- `client/src/features/organization/hooks/useTeamDetail.ts`
- `client/src/features/organization/hooks/useCreateTeam.ts`
- `client/src/features/organization/hooks/useUpdateTeam.ts`
- `client/src/features/organization/hooks/useDeleteTeam.ts`
- `client/src/features/organization/hooks/useTeamMembers.ts`
- `client/src/features/organization/hooks/useAddTeamMember.ts`
- `client/src/features/organization/hooks/useRemoveTeamMember.ts`

**Acceptance criteria:**
- [ ] `Team` model created with all fields and indexes
- [ ] `TeamMember` join table created with unique constraint (no duplicate memberships)
- [ ] `secondary_manager_id` field added to `User.model.ts`
- [ ] All 9 endpoints working and protected by `requireAuth`
- [ ] All queries scoped to `req.user.company_id`
- [ ] Delete blocked with 409 if team has active members (`TeamMember` count > 0)
- [ ] All mutations produce audit log entries (`team.created`, `team.updated`, `team.member_added`, `team.member_removed`)
- [ ] All hooks typed correctly with no `any`

---

### T-022 — Teams UI: Components + Team Management Page
**Owner:** Tayyab
**Sprint:** 3
**Covers:** US-01, US-02, US-04, US-06

**Components to create:**
- `client/src/features/organization/components/TeamTable.tsx`
- `client/src/features/organization/components/TeamForm.tsx`
- `client/src/features/organization/components/TeamMembersPanel.tsx`
- `client/src/features/organization/components/TeamManagerSelector.tsx`

**Page to create:**
- `client/src/pages/organization/TeamsPage.tsx`

**TeamTable columns:**
1. Name (with department badge below)
2. Manager (UserAvatar + name, warning icon if missing)
3. Members (count badge, click opens TeamMembersPanel)
4. Department (linked to dept)
5. Status (Active/Archived badge)
6. Actions (Edit, Manage Members, Archive — in RowActions dropdown)

**TeamForm fields:**
- Name (required)
- Department (required — searchable select from existing departments)
- Manager (searchable user select — must be a valid user in the same company)
- Description (optional textarea)

**TeamMembersPanel (slide-in sheet):**
- Shows current members list (UserAvatar + name + role_in_team badge)
- "Add Member" — searchable user combobox (filters out already-added members)
- Remove member button per row with confirm dialog
- Member count badge in panel header

**TeamsPage layout:**
1. Page header: "Teams" title + "Create Team" primary button (amber)
2. Filter bar: search by name + filter by department + filter by status
3. Stats row: Total Teams | Active Teams | Teams Without Manager (warning chip)
4. `TeamTable` with pagination

**Acceptance criteria:**
- [ ] Full CRUD works end-to-end (create, edit, archive)
- [ ] TeamForm validates: name required, department required, manager must be valid user
- [ ] TeamMembersPanel opens as slide-in sheet showing correct members
- [ ] Add member searches and filters out existing members
- [ ] Remove member shows `ConfirmDialog` before proceeding
- [ ] Archive blocked in UI if team has members (show error toast with member count)
- [ ] "Teams Without Manager" warning chip navigates to filtered view
- [ ] All 4 states handled: loading (TableSkeleton), error (ErrorState), empty (EmptyState), data

---

### T-023 — Business Unit Management + Org Hierarchy Enhancement
**Owner:** Tayyab
**Sprint:** 3
**Covers:** US-03, US-04

**Context:**
Business Units (`dept_type: 'business_unit'`) already exist in the Department model from T-001. This ticket adds:
1. A dedicated Business Units tab/section in the Organization page
2. Explicit BU CRUD (separate form mode for BU creation)
3. A hierarchy browser showing BU → Department → Team drill-down
4. User assignment to department + team in one form (US-04)

**Backend additions:**
```
GET  /api/v1/organization/business-units         → list all BUs (dept_type = 'business_unit')
GET  /api/v1/organization/business-units/:id/tree → full subtree: BU → depts → teams → headcount
POST /api/v1/organization/assign-user             → assign user to dept + teams in one call
  body: { user_id, department_id, team_ids: string[] }
```

**`/assign-user` endpoint logic:**
1. Validate `department_id` exists and is active
2. Validate all `team_ids` belong to that department
3. Update `User.department_id`
4. Upsert `TeamMember` records for each team_id (add new, remove old not in list)
5. Produce one audit event: `user.org_assignment_changed` with before/after

**Frontend additions:**

**Update `OrganizationPage.tsx`** to add a third tab: **Business Units**

**New component:** `client/src/features/organization/components/BusinessUnitTree.tsx`
- Shows: BU name → list of departments → list of teams per dept
- Each node shows headcount badge
- Expand/collapse per BU and per dept
- "Add Department to BU" shortcut button on BU row
- "Add Team to Dept" shortcut button on dept row

**New component:** `client/src/features/organization/components/UserOrgAssignmentModal.tsx`
- Triggered from People page and from org hierarchy nodes
- Step 1: Select department (searchable select)
- Step 2: Select teams within that department (multi-select checkboxes, auto-filtered to dept)
- Shows current assignment for reference
- Saves via `/assign-user` endpoint

**Acceptance criteria:**
- [ ] Business Units tab shows all BUs with dept + team counts
- [ ] BU tree expands to show full hierarchy: BU → Departments → Teams
- [ ] Create BU form defaults `dept_type` to `'business_unit'` and hides type selector
- [ ] BU deletion blocked if it has child departments (409 error + user-friendly message)
- [ ] `UserOrgAssignmentModal` saves dept + teams in one request
- [ ] After assignment, user's department and team memberships update immediately (React Query invalidation)
- [ ] Audit event `user.org_assignment_changed` produced with full before/after state

---

### T-024 — Drag-and-Drop Org Restructure + Enhanced Org Chart
**Owner:** Tayyab
**Sprint:** 3
**Covers:** US-05, US-08

**Context:**
The org chart from T-003 renders a static tree. This ticket adds:
1. Drag-to-reparent: drag a dept/team node and drop onto a new parent
2. Interactive org chart: click to expand/collapse, click node to open detail panel
3. Real-time update after any structural change

**Backend addition:**
```
PATCH /api/v1/organization/:id/move
  body: { new_parent_id: string | null }
```

**`/move` endpoint logic:**
1. Load target node and proposed new parent
2. Validate: would this create a circular hierarchy? (traverse ancestors — reject if target is already an ancestor of the new parent)
3. Validate: new parent must be same company
4. Update `parent_id` on the department
5. Produce audit event `department.moved` with `before: { parent_id }`, `after: { parent_id }`

**Frontend — update `OrgChartView.tsx`:**

**Drag-and-drop (using `@dnd-kit/core` already installed):**
- Each org chart node is a `<Draggable>` item
- Valid drop targets are highlighted with amber border on hover
- Drop triggers `PATCH /organization/:id/move`
- Optimistic UI: move the node immediately, revert if API call fails
- Show "Moving..." spinner on the dragged node during API call
- Circular hierarchy prevention: grey-out invalid drop targets in real time

**Interactive chart:**
- Each node has collapse/expand chevron button (▶ / ▼)
- Collapsed nodes show child count badge: `+3 departments`
- Clicking a node (not drag) opens `DepartmentPanel` slide-in (already built in T-003)
- "Navigate into" button inside panel to make that node the chart root (zoom into subtree)
- Breadcrumb at top of chart shows current root path

**Acceptance criteria:**
- [ ] Drag-and-drop reparents correctly — `parent_id` updates in DB
- [ ] Circular hierarchy prevented: cannot drop a node onto its own descendant (grey-out + tooltip)
- [ ] Audit event `department.moved` produced with before/after `parent_id`
- [ ] Optimistic UI reverts correctly on API failure (toast error + node snaps back)
- [ ] Expand/collapse works: collapsed nodes show `+N` child count
- [ ] Clicking a node opens `DepartmentPanel` side panel
- [ ] Breadcrumb navigation updates when zooming into subtree

---

### T-025 — Org Structural Health UI + Org Change History
**Owner:** Tayyab
**Sprint:** 3
**Covers:** US-09, US-10

**Context:**
Intelligence rules RULE-02 (dept with no manager) and RULE-05 (orphan team) exist from T-005 but there is no dedicated UI for navigating structural issues. US-09 requires a health panel where admins can see all structural problems and jump directly to them. US-10 requires org-scoped change history.

**Backend additions:**
```
GET  /api/v1/organization/health         → all active insights for org module (severity + affected object)
GET  /api/v1/organization/history        → audit events filtered to org + teams modules, paginated
  query params: ?page=1&limit=20&object_type=department|team&action=
```

**`/health` endpoint:**
- Query `Insight` collection: `{ company_id, module: 'organization', is_resolved: false }`
- Enrich each insight with the affected object's current name and status
- Group by severity: critical first, then warning, then info
- Return `{ critical: Insight[], warning: Insight[], info: Insight[] }`

**Frontend components:**

**New page:** `client/src/pages/organization/OrgHealthPage.tsx`
- Accessible from the sidebar under Organization, or from a "View all issues →" link in the org intelligence banner
- URL: `/organization/health`

**Layout:**
```
Page header: "Structural Health" + subtitle "Active issues across your org hierarchy"
Severity sections (collapsible):
  🔴 Critical (N)  — red left-border cards
  🟡 Warning (N)   — amber left-border cards
  🔵 Info (N)      — blue left-border cards

Each insight card:
  - Icon + severity chip
  - Title (e.g. "Department has no manager")
  - Affected object: linked chip → clicking navigates to that dept/team
  - Detected N days ago
  - "Fix Now →" button → deep link to the correct record (uses remediation_url)
  - "Dismiss" button → PATCH /intelligence/insights/:id/resolve
```

**Empty state:** "✓ No structural issues detected" with green check illustration

**Org Change History tab:**
Add a **History** tab to `OrganizationPage.tsx` (next to Table / Org Chart / Business Units tabs).

**`OrgHistoryTab.tsx` component:**
- Fetches `/api/v1/organization/history`
- Timeline list: each entry shows actor avatar + action pill + object name + timestamp
- Action pills use mono font with colored backgrounds (same style as AuditLogsPage from H-013)
- Filter by: object type (Department / Team / Business Unit) + date range
- Click row to expand before/after JSON diff (same component pattern as H-013)

**Acceptance criteria:**
- [ ] `/organization/health` returns correctly grouped insights
- [ ] OrgHealthPage shows all 3 severity groups with correct counts
- [ ] "Fix Now →" deep link navigates to the correct department or team record
- [ ] Dismiss marks insight `is_resolved: true` and removes it from view
- [ ] Empty state shows when no issues exist
- [ ] History tab shows all department and team mutations
- [ ] Filters (object type, date range) work and combine
- [ ] Row expand shows before/after diff (reuse AuditLog diff component)
- [ ] RULE-08, RULE-09 also wired to fire after org mutations (add to intelligence runner in T-005)

---

## SPRINT 3 — HAMMAD TICKETS

---

### H-021 — Secondary Reporting Lines: Schema + API + UI
**Owner:** Hammad
**Sprint:** 3
**Covers:** US-07

**Context:**
US-07 requires matrix org support: one primary manager + one or more secondary managers per user. T-021 already adds `secondary_manager_id` field to `User.model.ts` — but that only supports one secondary. Matrix orgs need many secondary managers. This ticket implements the proper many-to-many reporting structure.

**Update `User.model.ts`:**
Replace the single `secondary_manager_id` field (added in T-021) with a `secondary_manager_ids: ObjectId[]` array field.

**Backend additions:**
```
GET  /api/v1/people/:id/reporting-lines          → { primary_manager, secondary_managers, direct_reports }
POST /api/v1/people/:id/reporting-lines/secondary
  body: { manager_id: string }                   → add secondary manager
DELETE /api/v1/people/:id/reporting-lines/secondary/:managerId → remove secondary manager
PUT  /api/v1/people/:id/reporting-lines/primary
  body: { manager_id: string }                   → change primary manager
```

**Reporting Lines logic:**
- Primary manager = `User.primary_manager_id` (already exists)
- Secondary managers = `User.secondary_manager_ids[]` (new array field)
- `direct_reports` = all users where `primary_manager_id === userId`
- A user cannot be their own manager (validate at API level)
- Circular check: A → B → A is invalid (traverse chain before saving)

**Frontend components:**

**New component:** `client/src/features/people/components/ReportingLinesPanel.tsx`
- Shown as a tab inside the User Detail / Profile slide-in panel
- Section 1: **Primary Manager** — UserAvatar card with "Change" button
- Section 2: **Secondary Managers** — list of UserAvatar cards + "Add Secondary Manager" button + remove (×) per card
- Section 3: **Direct Reports** — read-only list of users who report to this user

**Primary Manager:** Single user select (searchable combobox, excludes self + circular refs)
**Secondary Managers:** Multi-add flow — combobox appears inline, adds to list on select

**Design:**
- Clear visual distinction: primary manager shown with solid amber border, secondary with dashed border
- Label chips: "Primary" (amber badge) vs "Secondary" (gray badge)

**Acceptance criteria:**
- [ ] `secondary_manager_ids` array field on User model, properly indexed
- [ ] All 4 reporting line endpoints working and company-scoped
- [ ] Cannot assign self as manager (400 validation error)
- [ ] Circular reporting chain prevented (A cannot report to B if B already reports to A)
- [ ] `ReportingLinesPanel` correctly shows primary, secondaries, and direct reports
- [ ] Adding secondary manager updates array and produces audit event `user.secondary_manager_added`
- [ ] Removing secondary manager produces audit event `user.secondary_manager_removed`
- [ ] Changing primary manager produces audit event `user.primary_manager_changed`

---

### H-022 — Policies MongoDB Schema + Versioning Engine
**Owner:** Hammad
**Sprint:** 3
**Covers:** PRD 6.6

**Models to create:**
- `server/src/models/Policy.model.ts`
- `server/src/models/PolicyVersion.model.ts`
- `server/src/models/PolicyAssignment.model.ts`
- `server/src/models/PolicyAcknowledgment.model.ts`

**Policy schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  name: string,
  description: string,
  type: 'leave' | 'attendance' | 'remote_work' | 'it_usage' | 'security',
  status: 'draft' | 'active' | 'archived',
  current_version_id: ObjectId,     // points to latest published PolicyVersion
  requires_acknowledgment: boolean,
  created_by: ObjectId,
  created_at: Date,
  updated_at: Date,
}
```

**PolicyVersion schema (immutable — no update/delete):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  policy_id: ObjectId,
  version_number: number,           // auto-increment per policy
  content: string,                  // rich text HTML from Tiptap editor
  published_by: ObjectId,
  published_at: Date,
  change_summary: string | null,    // what changed in this version
}
```

**PolicyAssignment schema (targeting engine):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  policy_id: ObjectId,
  target_type: 'role' | 'department' | 'location' | 'lifecycle_state' | 'all',
  target_id: string | null,         // null when target_type = 'all'
  logic: 'AND' | 'OR',             // for combining multiple targets
  created_at: Date,
}
```

**PolicyAcknowledgment schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  policy_id: ObjectId,
  policy_version_id: ObjectId,
  user_id: ObjectId,
  acknowledged_at: Date,
  ip_address: string | null,
}
```

**Indexes:**
```javascript
PolicySchema.index({ company_id: 1, status: 1 });
PolicySchema.index({ company_id: 1, type: 1 });
PolicyVersionSchema.index({ policy_id: 1, version_number: 1 });
PolicyAssignmentSchema.index({ company_id: 1, policy_id: 1 });
PolicyAcknowledgmentSchema.index({ policy_id: 1, user_id: 1 });
PolicyAcknowledgmentSchema.index({ company_id: 1, user_id: 1 });
```

**Versioning engine — `server/src/lib/policyVersioning.ts`:**
```typescript
// publishPolicy(policyId, content, actorId, changeSummary)
// 1. Increment version_number (find latest version for policy, +1)
// 2. Create immutable PolicyVersion document
// 3. Update Policy.current_version_id + Policy.status = 'active'
// 4. If requires_acknowledgment: trigger notification to all targeted users
// 5. Produce audit event: policy.published with version number in after_state
```

**Acceptance criteria:**
- [ ] All 4 models created with correct schemas and indexes
- [ ] `PolicyVersion` has no DELETE or PUT routes (immutable — enforced at route level)
- [ ] `publishPolicy()` correctly increments version number per policy
- [ ] Publishing produces audit event `policy.published` with version in after_state
- [ ] `PolicyAcknowledgment` records are unique per user + policy version (compound index)

---

### H-023 — Policies API + Full UI
**Owner:** Hammad
**Sprint:** 3
**Covers:** PRD 6.6

**Backend endpoints:**
```
GET    /api/v1/policies                         → list policies (company-scoped, paginated)
GET    /api/v1/policies/:id                     → policy detail + current version content
POST   /api/v1/policies                         → create policy (status: 'draft')
PUT    /api/v1/policies/:id                     → update draft metadata (name, desc, type)
POST   /api/v1/policies/:id/publish             → publish (creates new PolicyVersion)
POST   /api/v1/policies/:id/archive             → archive policy
GET    /api/v1/policies/:id/versions            → list all versions (version_number, published_at, published_by)
GET    /api/v1/policies/:id/versions/:versionId → single version content (for diff view)
POST   /api/v1/policies/:id/assignments         → set targeting rules (replace all assignments)
GET    /api/v1/policies/:id/assignments         → get targeting rules
POST   /api/v1/policies/:id/acknowledge         → user acknowledges current version
GET    /api/v1/policies/:id/acknowledgments     → list acknowledgments (admin view)
```

**Page:** `client/src/pages/policies/PoliciesPage.tsx`

**Layout:**
1. Page header: "Policies" + "Create Policy" button
2. Filter bar: search + type filter + status filter
3. `PolicyTable` with columns: Name, Type, Status badge, Version, Last Published, Acknowledgments (X/Y), Actions

**Policy Detail (slide-in panel or full-page route `/policies/:id`):**
- Tab 1: **Content** — Tiptap rich text editor (editable for drafts, read-only for active)
- Tab 2: **Targeting** — shows assignment rules, "Edit Targeting" opens `PolicyTargetingModal`
- Tab 3: **Versions** — list of all versions with version number, date, published by, change summary
  - "Compare" button between any two versions → side-by-side diff (use a simple line diff)
- Tab 4: **Acknowledgments** — table of users who have/haven't acknowledged (with % progress bar)

**`PolicyTargetingModal` component:**
- Allows adding multiple targeting rules
- Each rule: target_type select + target_id select (auto-populated based on type)
- Logic selector: AND / OR between rules
- Preview: "This policy will apply to N users" (computed from rules)

**Acceptance criteria:**
- [ ] Full policy CRUD: create draft → edit content → publish → archive
- [ ] Tiptap editor works in edit mode, renders formatted content in read-only
- [ ] Publishing creates new version, old version remains accessible in versions tab
- [ ] Targeting modal correctly saves assignment rules
- [ ] Acknowledgment tracking: percentage and list visible to admin
- [ ] Version diff view shows changes between two selected versions
- [ ] All mutations produce audit events
- [ ] RULE-08 (conflicting policies on same user population) checked after assignment save

---

### H-024 — Workflows Module: Schema + API + UI
**Owner:** Hammad
**Sprint:** 3
**Covers:** PRD 6.7

**Models to create:**
- `server/src/models/Workflow.model.ts`
- `server/src/models/WorkflowStep.model.ts`
- `server/src/models/WorkflowRun.model.ts`

**Workflow schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  name: string,
  description: string | null,
  status: 'active' | 'draft' | 'disabled',
  trigger_event: 'user.lifecycle_changed' | 'user.invited' | 'role.changed' | 'policy.published',
  trigger_conditions: Record<string, unknown>,  // e.g. { to_state: 'active' } for lifecycle trigger
  created_by: ObjectId,
  created_at: Date,
  updated_at: Date,
}
```

**WorkflowStep schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  workflow_id: ObjectId,
  step_order: number,
  action_type: 'send_email' | 'assign_role' | 'create_audit_event' | 'call_webhook',
  action_config: Record<string, unknown>,  // varies per action_type
  // send_email: { template_id, recipient_type: 'user' | 'manager' | 'admin' }
  // assign_role: { role_id }
  // create_audit_event: { message }
  // call_webhook: { url, method, headers, body_template }
}
```

**WorkflowRun schema (immutable log):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  workflow_id: ObjectId,
  trigger_event: string,
  trigger_payload: Record<string, unknown>,
  status: 'success' | 'failed' | 'partial',
  steps_executed: number,
  error_message: string | null,
  executed_at: Date,
}
```

**Workflow executor — `server/src/lib/workflowExecutor.ts`:**
```typescript
// executeWorkflow(triggerEvent, triggerPayload, company_id)
// 1. Find all active workflows for company where trigger_event matches
// 2. For each workflow: execute steps in order
// 3. On any step failure: log error, mark run as 'failed', continue to next workflow
// 4. Create WorkflowRun record for each execution
// 5. If failed: trigger intelligence insight (RULE: failed workflow)
```

**Wire workflow executor into lifecycle.ts:**
After each lifecycle transition, call:
```typescript
await executeWorkflow('user.lifecycle_changed', { userId, from_state, to_state }, company_id);
```

**API endpoints:**
```
GET    /api/v1/workflows                    → list workflows
GET    /api/v1/workflows/:id               → workflow detail + steps
POST   /api/v1/workflows                   → create workflow
PUT    /api/v1/workflows/:id               → update workflow
POST   /api/v1/workflows/:id/enable        → set status: 'active'
POST   /api/v1/workflows/:id/disable       → set status: 'disabled'
DELETE /api/v1/workflows/:id              → delete (only drafts)
GET    /api/v1/workflows/:id/runs          → paginated run history
POST   /api/v1/workflows/:id/test          → execute once with mock payload (dev/testing)
```

**Page:** `client/src/pages/workflows/WorkflowsPage.tsx`

**Layout:**
1. Page header: "Workflows & Automation" + "Create Workflow" button
2. `WorkflowsTable`: Name, Trigger, Status badge, Last Run, Success Rate (runs), Actions

**Workflow Detail (slide-in panel):**
- Step list: ordered, each step shows action_type icon + summary of config
- "Add Step" button (opens step type selector + config form)
- Reorder steps via drag handle (using `@dnd-kit/sortable` already installed)
- Run History tab: `WorkflowRunsTable` — date, status, trigger payload summary, error message

**Acceptance criteria:**
- [ ] Workflow CRUD: create draft → add steps → enable → disable → delete (draft only)
- [ ] Executor fires correctly on `user.lifecycle_changed` event
- [ ] `WorkflowRun` logged for every execution (success and failure)
- [ ] Failed workflow creates intelligence insight visible in overview
- [ ] Step reordering via drag handle updates `step_order` in DB
- [ ] Test endpoint executes workflow with mock payload and returns result
- [ ] All workflow mutations produce audit events

---

### H-025 — Hammad Sprint 3 Polish + Intelligence Rules Extension
**Owner:** Hammad
**Sprint:** 3

**Intelligence rule additions:**
- **RULE-08:** Two active policies targeting the same user population with conflicting rules
  - Detection: after every `PolicyAssignment` save, run intersection check across active policies
  - Flag: if same user(s) appear in two policies of the same type with different rules
- **RULE-09:** Duplicate user detection (same full_name + email domain)
  - Run: after every user creation / profile update
  - Flag: if `full_name` matches another user under the same company + same email domain

**Cleanup tasks:**
- [ ] Verify all Sprint 3 mutations produce correct audit events
- [ ] Run `npx tsc --noEmit` — zero TypeScript errors on client and server
- [ ] Add missing `company_id` index checks (grep `.find(` — each must have `company_id`)
- [ ] Test policy publish flow end-to-end: create → edit → publish → version visible
- [ ] Test workflow: invite user → lifecycle changes to `onboarding` → workflow fires send_email step → WorkflowRun logged
- [ ] Verify `ReportingLinesPanel` shows correct data for a user with 1 primary + 2 secondary managers

---

## SPRINT 4 — TAYYAB TICKETS

---

### T-031 — Locations Module: Schema + API + UI
**Owner:** Tayyab
**Sprint:** 4
**Covers:** PRD 6.8

**Model to create:**
- `server/src/models/Location.model.ts`

**Location schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  name: string,
  type: 'region' | 'country' | 'city' | 'office',
  parent_id: ObjectId | null,        // hierarchy: Region → Country → City → Office
  timezone: string,                  // IANA timezone string e.g. 'Asia/Karachi'
  is_headquarters: boolean,
  working_hours: {
    monday: { start: string; end: string } | null,
    tuesday: { start: string; end: string } | null,
    wednesday: { start: string; end: string } | null,
    thursday: { start: string; end: string } | null,
    friday: { start: string; end: string } | null,
    saturday: { start: string; end: string } | null,
    sunday: { start: string; end: string } | null,
  } | null,
  address: string | null,
  is_active: boolean,
  created_at: Date,
  updated_at: Date,
}
```

**Also update `User.model.ts`:** Add `location_id: ObjectId | null` field.

**API endpoints:**
```
GET    /api/v1/locations                    → list all locations (company-scoped)
GET    /api/v1/locations/tree               → full hierarchy tree (recursive)
GET    /api/v1/locations/:id               → location detail
POST   /api/v1/locations                   → create location
PUT    /api/v1/locations/:id               → update location
DELETE /api/v1/locations/:id              → soft delete (blocked if users assigned)
POST   /api/v1/locations/:id/assign-user   → assign user to location { user_id }
```

**Page:** `client/src/pages/locations/LocationsPage.tsx`

**Layout:**
1. Page header: "Locations" + "Add Location" button
2. Two-panel layout:
   - Left panel: Location tree (hierarchy tree, expand/collapse per level)
   - Right panel: Location detail (shows on node click): name, type, timezone, working hours, headcount, users list
3. "Add Location" form (modal): name, type, parent (select from existing), timezone (searchable IANA list), is_headquarters toggle, working hours per day

**Acceptance criteria:**
- [ ] Location hierarchy renders correctly (Region → Country → City → Office)
- [ ] IANA timezone saved and displayed with correct local time preview
- [ ] Headquarters flag: only one location per company can be HQ (validate at API)
- [ ] Deleting a location blocked if users are assigned (409 with count)
- [ ] `location_id` added to User model — shown in People page user detail
- [ ] All mutations produce audit events

---

### T-032 — Custom Fields: Schema + Builder + UI
**Owner:** Tayyab
**Sprint:** 4
**Covers:** PRD 6.10

**Models to create:**
- `server/src/models/CustomField.model.ts`
- `server/src/models/CustomFieldValue.model.ts`

**CustomField schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  name: string,
  label: string,                  // display label shown in UI
  field_key: string,              // unique slug per company + object_type e.g. 'employee_number'
  object_type: 'user' | 'department' | 'policy',
  field_type: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'url' | 'email' | 'phone',
  options: string[],              // only for select / multi_select
  is_required: boolean,
  display_order: number,          // for drag-to-reorder
  visible_to_roles: string[],     // [] = visible to all
  editable_by_roles: string[],    // [] = editable by all
  is_active: boolean,
  created_at: Date,
}
```

**CustomFieldValue schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  custom_field_id: ObjectId,
  object_type: 'user' | 'department' | 'policy',
  object_id: ObjectId,
  value: unknown,               // type matches field_type
  updated_by: ObjectId,
  updated_at: Date,
}
```

**API endpoints:**
```
GET    /api/v1/data-fields                          → list fields (filterable by object_type)
POST   /api/v1/data-fields                          → create field
PUT    /api/v1/data-fields/:id                      → update field (cannot change field_type after creation)
DELETE /api/v1/data-fields/:id                      → soft delete (is_active: false)
PATCH  /api/v1/data-fields/reorder                  → reorder: body { ordered_ids: string[] }
GET    /api/v1/data-fields/values/:objectType/:objectId → get all custom field values for object
PUT    /api/v1/data-fields/values/:objectType/:objectId → set/update values: { field_key: value, ... }
```

**Page:** `client/src/pages/data-fields/DataFieldsPage.tsx`

**Layout:**
1. Page header: "Data & Custom Fields"
2. Tabs: **Users** | **Departments** | **Policies** (one tab per object_type)
3. Per tab: drag-to-reorder list of fields with type badge, required flag, visibility info
4. "Add Field" button → `CustomFieldBuilderModal`

**`CustomFieldBuilderModal`:**
- Field label (required)
- Field type select: text / number / date / boolean / select / multi_select / url / email / phone
- If select/multi_select: options builder (add/remove options inline)
- Required toggle
- Visibility: "Visible to all roles" or select specific roles
- Editable by: "All roles" or select specific roles

**Integration with existing forms:**
- `UserForm.tsx` (from H-003): after loading user, fetch custom field definitions + values for `object_type: 'user'`, render them below standard fields
- `DepartmentForm.tsx` (from T-003): same for `object_type: 'department'`

**Acceptance criteria:**
- [ ] Field builder creates fields that immediately appear in User and Department forms
- [ ] `field_type` cannot be changed after creation (return 400 if attempted)
- [ ] Select/multi_select fields render as dropdowns with correct options
- [ ] Field visibility enforced: admin without correct role cannot see the field in API response
- [ ] Drag-to-reorder updates `display_order` and persists across sessions
- [ ] Custom field values saved correctly per object (user, dept, policy)
- [ ] Adding a field does not break existing records (missing values return null)

---

### T-033 — Integrations Module: Schema + API + UI (MVP: 3 connectors)
**Owner:** Tayyab
**Sprint:** 4
**Covers:** PRD 6.12

**Model to create:**
- `server/src/models/Integration.model.ts`
- `server/src/models/IntegrationSyncLog.model.ts`

**Integration schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  provider: 'google_workspace' | 'slack' | 'payroll_stub',
  status: 'active' | 'inactive' | 'error',
  auth_type: 'oauth2' | 'api_key',
  credentials_encrypted: string,    // AES-256 encrypted — NEVER return in API response
  field_mappings: {
    source_field: string,
    target_field: string,
  }[],
  last_sync_at: Date | null,
  last_sync_status: 'success' | 'failed' | null,
  created_at: Date,
}
```

**IntegrationSyncLog schema (immutable):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  integration_id: ObjectId,
  provider: string,
  started_at: Date,
  completed_at: Date | null,
  status: 'success' | 'failed' | 'partial',
  rows_synced: number,
  rows_failed: number,
  error_message: string | null,
}
```

**Security rule:** `credentials_encrypted` must NEVER appear in any API response. Encrypt with AES-256 using `ENCRYPTION_KEY` env var before saving. Add to `server/.env`:
```bash
ENCRYPTION_KEY=your_32_byte_hex_key
```

**API endpoints:**
```
GET    /api/v1/integrations                    → list integrations (credentials stripped)
GET    /api/v1/integrations/:id               → integration detail (credentials stripped)
POST   /api/v1/integrations/connect           → connect new integration { provider, auth_type, credentials }
PUT    /api/v1/integrations/:id               → update field mappings
POST   /api/v1/integrations/:id/disconnect    → remove integration + wipe credentials
POST   /api/v1/integrations/:id/sync          → trigger manual sync
GET    /api/v1/integrations/:id/logs          → paginated sync logs
```

**MVP stub implementations (no real OAuth flow — use API key mode):**
- **Google Workspace:** Accept a service account JSON key. Stub: simulate fetching user list and creating/updating User documents.
- **Slack:** Accept bot token. Stub: simulate fetching workspace member list.
- **Payroll stub:** Accept API key. Stub: simulate fetching employee IDs.

**Page:** `client/src/pages/integrations/IntegrationsPage.tsx`

**Layout:**
1. Page header: "Integrations"
2. 3-card grid (one per MVP connector): logo + name + status badge + "Connect" or "Disconnect" button
3. Clicking a connected card opens `IntegrationDetailPanel`:
   - Status + last sync time
   - Field mapping table (source → target columns, editable)
   - "Sync Now" button
   - Sync Logs tab: table of past syncs with status, rows synced, error message

**Acceptance criteria:**
- [ ] Credentials stored AES-256 encrypted — raw credentials never in API response
- [ ] Field mapping table editable and saved
- [ ] "Sync Now" triggers sync endpoint and shows result toast
- [ ] Sync log appears after every sync (manual or scheduled)
- [ ] Sync failure triggers admin notification (use Notification system from H-031)
- [ ] Disconnect wipes `credentials_encrypted` field
- [ ] All mutations produce audit events

---

### T-034 — Tayyab Sprint 4 Polish + End-to-End Org Tests
**Owner:** Tayyab
**Sprint:** 4

**Tasks:**
- [ ] Complete org flow: create BU → add dept to BU → add team to dept → assign manager to team → assign user to dept + team → verify org chart shows full hierarchy
- [ ] Verify drag-and-drop reparent audit event appears in Org History tab
- [ ] Intelligence RULE-05 fires for orphan teams: create team with no dept → verify insight
- [ ] Custom fields appear in User form and Department form for all field types
- [ ] Locations assigned to users appear in People page user detail
- [ ] Integration sync log persists after page refresh (stored in DB, not memory)
- [ ] `npx tsc --noEmit` — zero errors client + server
- [ ] No hardcoded `company_id` — grep `.find(` audit pass
- [ ] All pages handle loading, error, empty states correctly

---

## SPRINT 4 — HAMMAD TICKETS

---

### H-031 — Notifications Module: Schema + Templates + Delivery
**Owner:** Hammad
**Sprint:** 4
**Covers:** PRD 6.11

**Models to create:**
- `server/src/models/NotificationTemplate.model.ts`
- `server/src/models/NotificationEvent.model.ts`

**NotificationTemplate schema:**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  name: string,
  event_trigger: string,            // e.g. 'user.invited', 'policy.published', 'workflow.failed'
  channel: 'email' | 'in_app',
  subject: string,                  // for email; supports {{variables}}
  body: string,                     // HTML for email, plain text for in_app; supports {{variables}}
  // Supported variables: {{user.full_name}}, {{department.name}}, {{company.name}}, {{policy.name}}
  digest_mode: 'immediate' | 'hourly' | 'daily',
  is_critical: boolean,             // if true: bypass digest, always deliver immediately
  is_active: boolean,
  created_at: Date,
}
```

**NotificationEvent schema (delivery log):**
```typescript
{
  _id: ObjectId,
  company_id: ObjectId,
  template_id: ObjectId,
  recipient_user_id: ObjectId,
  channel: 'email' | 'in_app',
  status: 'pending' | 'sent' | 'failed' | 'read',
  rendered_subject: string,
  rendered_body: string,
  sent_at: Date | null,
  read_at: Date | null,
  error_message: string | null,
  created_at: Date,
}
```

**Notification service — `server/src/lib/notificationService.ts`:**
```typescript
// sendNotification(templateId, recipientUserId, variables)
// 1. Load template
// 2. Render subject + body with variable substitution: replace {{user.full_name}} etc.
// 3. If is_critical OR digest_mode = 'immediate': deliver now
//    - email: via emailService.ts
//    - in_app: create NotificationEvent with status 'pending', WebSocket push (or polling)
// 4. If digest: queue — store NotificationEvent with status 'pending', deliver on digest schedule
```

**API endpoints:**
```
GET  /api/v1/notifications/templates                  → list templates
POST /api/v1/notifications/templates                  → create template
PUT  /api/v1/notifications/templates/:id              → update template
GET  /api/v1/notifications/inbox                      → in-app inbox for current user (status: pending/read)
POST /api/v1/notifications/inbox/:id/read             → mark as read
GET  /api/v1/notifications/inbox/unread-count         → badge count for TopBar bell icon
```

**Wire into existing triggers:**
- User invite: `notificationService.send('user.invited', userId, { user, company })`
- Policy published with acknowledgment required: send to all targeted users
- Workflow failed: send to all super_admin users

**Page:** `client/src/pages/notifications/NotificationsPage.tsx` — template list + editor

**TopBar integration (update `TopBar.tsx` from SETUP-003):**
- Bell icon polls `/api/v1/notifications/inbox/unread-count` every 30s
- Shows red badge with count when > 0
- Clicking bell opens a popover: last 5 unread in-app notifications + "View all" link

**Acceptance criteria:**
- [ ] Variable substitution works for all 4 supported tokens
- [ ] Critical notifications deliver via email within 60 seconds (test with workflow failure)
- [ ] In-app notifications appear in TopBar bell with correct unread count
- [ ] Marking notification as read updates status and removes from unread count
- [ ] Digest mode: `hourly` notifications not sent immediately (only queued)
- [ ] All delivery attempts logged in `NotificationEvent` with status

---

### H-032 — User Assignment to Locations + People Page Enhancements
**Owner:** Hammad
**Sprint:** 4
**Covers:** PRD 6.8 (people side) + US-04 completion

**Context:**
T-031 adds `location_id` to the User model. This ticket integrates it into the People module.

**Backend addition:**
Update `PUT /api/v1/people/:id` to accept `location_id` and produce audit event on change.

**Frontend updates:**

**Update `UserForm.tsx` (from H-003):**
- Add "Location" field: searchable select populated from `/api/v1/locations`
- Shows location name + timezone hint

**Update `UserTable.tsx` (from H-003):**
- Add optional "Location" column (hidden by default, toggleable via column visibility control)

**Update `PeoplePage.tsx` (from H-004):**
- Add location filter to filter bar: "All Locations" dropdown populated from location list

**Update `IdentityHealthBadge.tsx` (from H-003):**
- Add location signal: amber dot if user has no location assigned

**Acceptance criteria:**
- [ ] Location field appears in UserForm with searchable select
- [ ] Saving user with location produces audit event `user.location_assigned`
- [ ] People page location filter works correctly
- [ ] IdentityHealthBadge shows amber dot for users with no location
- [ ] User detail panel shows location name + timezone

---

### H-033 — Bulk Actions + People Page Power Features
**Owner:** Hammad
**Sprint:** 4

**Context:**
PRD 6.3 specifies bulk actions. Current People page only supports individual actions. Add bulk operations.

**Backend endpoints:**
```
POST /api/v1/people/bulk/lifecycle    → { user_ids: string[], to_state: string }
POST /api/v1/people/bulk/assign-role  → { user_ids: string[], role_id: string }
POST /api/v1/people/bulk/export       → streams CSV of filtered users
  body: { filters: { lifecycle_state?, department_id?, location_id? } }
```

**Bulk action rules:**
- Validate each user_id independently — return per-user success/error (same pattern as bulk invite)
- Each successfully transitioned user produces its own audit event
- Bulk export logs one audit event: `people.bulk_exported` with filter params + row count

**Frontend updates to `PeoplePage.tsx`:**

**Row selection:**
- Add checkbox column to `UserTable.tsx` (leftmost column)
- Header checkbox: select/deselect all on current page
- Selection count badge appears above table when > 0 rows selected: "3 users selected"

**Bulk action bar (appears when rows selected):**
```
[3 users selected]  [Change Status ▼]  [Assign Role ▼]  [Export Selected]  [Clear selection ×]
```

**`BulkLifecycleModal`:**
- Shows current states of selected users (may be mixed)
- Select target state (only shows states valid for ALL selected users — intersection of valid transitions)
- Warning: "X users cannot transition to this state and will be skipped"
- Confirm + execute

**`BulkRoleAssignModal`:**
- Single role select
- Confirm + execute

**Acceptance criteria:**
- [ ] Row selection works: individual + select-all-on-page
- [ ] Bulk action bar appears/disappears correctly
- [ ] Bulk lifecycle change: each user produces individual audit event
- [ ] Invalid transitions skipped with clear error count in result toast: "5 updated, 2 skipped"
- [ ] Bulk role assign works and produces audit events
- [ ] Bulk export streams CSV with all visible columns
- [ ] Export audit event logged with filter params + row count

---

### H-034 — Hammad Sprint 4 Polish + Full Integration Tests
**Owner:** Hammad
**Sprint:** 4

**Tasks:**
- [ ] Policy publish → acknowledgment required → notification sent to targeted users → user sees in TopBar bell
- [ ] Workflow fires on lifecycle change → WorkflowRun logged → run visible in workflow detail
- [ ] Bulk lifecycle change → each user has individual audit event → bulk export CSV contains updated states
- [ ] Notification template variable substitution test: `{{user.full_name}}` renders correctly
- [ ] Intelligence RULE-08 fires after two conflicting policies saved → insight appears in Overview
- [ ] Intelligence RULE-09 fires after duplicate user created
- [ ] `npx tsc --noEmit` — zero errors client + server
- [ ] All Sprint 4 pages handle loading, error, empty states

---

## SPRINT 3 & 4 — END OF SPRINT CHECKLIST

*Both developers review together. This completes Phase 1 (all PRD modules).*

### Org Module (User Stories US-01 to US-10):
- [ ] Create BU → add departments to BU → add teams to departments
- [ ] Assign manager to team (US-06) — visible in team detail and org chart
- [ ] User assigned to department + teams in one form (US-04)
- [ ] Secondary reporting: user has 1 primary + 2 secondary managers (US-07)
- [ ] Drag-and-drop reparent dept to new BU — audit event logged, org chart updates (US-05)
- [ ] Org chart: expand/collapse nodes, click to navigate, breadcrumb navigation (US-08)
- [ ] Org Health page shows RULE-02 + RULE-05 insights with "Fix Now" deep links (US-09)
- [ ] Org History tab shows all structural changes with before/after diff (US-10)

### New PRD Modules:
- [ ] Policies: create → publish → new version created → old version accessible
- [ ] Policy targeting: assign to department → correct users resolved
- [ ] Policy acknowledgment: user sees notification, can acknowledge
- [ ] Workflow fires on user lifecycle change → run logged
- [ ] Locations: create hierarchy (Region → Office) → assign user → appears in People filter
- [ ] Custom fields: create text + select fields for Users → appear in UserForm → values saved
- [ ] Integrations: connect Google Workspace stub → sync → sync log visible
- [ ] Notifications: in-app bell shows unread count, notifications delivered

### Intelligence Rules (complete set):
- [ ] RULE-01: Active user with no role → critical insight ✓ (Sprint 1)
- [ ] RULE-02: Dept with no manager → critical insight ✓ (Sprint 1)
- [ ] RULE-03: Active user with no dept → warning ✓ (Sprint 1)
- [ ] RULE-04: User inactive 90 days → warning ✓ (Sprint 1)
- [ ] RULE-05: Orphan team → warning ✓ (Sprint 1)
- [ ] RULE-06: Over-permissioned role → critical ✓ (Sprint 2)
- [ ] RULE-07: Admin with no MFA → warning ✓ (Sprint 2)
- [ ] RULE-08: Conflicting policies on same users → warning ✓ (Sprint 3)
- [ ] RULE-09: Duplicate user detected → warning ✓ (Sprint 3)
- [ ] RULE-10: Setup progress < 50% after 7 days → info ✓ (Sprint 2 Overview)

### Quality:
- [ ] `npx tsc --noEmit` — zero TypeScript errors on both client and server
- [ ] All pages handle loading, error, empty, and data states
- [ ] No hardcoded colors anywhere
- [ ] No missing `company_id` filters
- [ ] No direct API calls in components
- [ ] All backend mutations produce audit events

### Performance:
- [ ] Org chart with 50 departments renders in under 500ms
- [ ] Policy list with 50 policies loads under 200ms
- [ ] Custom fields appear in UserForm with no perceptible delay

---

## TICKET SUMMARY — SPRINT 3 & 4

| Ticket | Developer | Sprint | Module | User Story / PRD |
|---|---|---|---|---|
| T-021 | Tayyab | 3 | Teams Schema + API | US-01, US-02, US-04, US-06 |
| T-022 | Tayyab | 3 | Teams UI | US-01, US-02, US-04, US-06 |
| T-023 | Tayyab | 3 | Business Units + Hierarchy + User Org Assignment | US-03, US-04 |
| T-024 | Tayyab | 3 | Drag-and-Drop Restructure + Enhanced Org Chart | US-05, US-08 |
| T-025 | Tayyab | 3 | Org Health UI + Org Change History | US-09, US-10 |
| H-021 | Hammad | 3 | Secondary Reporting Lines | US-07 |
| H-022 | Hammad | 3 | Policies Schema + Versioning Engine | PRD 6.6 |
| H-023 | Hammad | 3 | Policies API + Full UI | PRD 6.6 |
| H-024 | Hammad | 3 | Workflows Module | PRD 6.7 |
| H-025 | Hammad | 3 | Sprint 3 Polish + Intelligence RULE-08, RULE-09 | — |
| T-031 | Tayyab | 4 | Locations Module | PRD 6.8 |
| T-032 | Tayyab | 4 | Custom Fields Builder + Integration | PRD 6.10 |
| T-033 | Tayyab | 4 | Integrations Module (3 connectors) | PRD 6.12 |
| T-034 | Tayyab | 4 | Sprint 4 Polish + Org E2E Tests | — |
| H-031 | Hammad | 4 | Notifications Templates + Delivery Engine | PRD 6.11 |
| H-032 | Hammad | 4 | User Location Assignment + People Enhancements | PRD 6.8 (people) |
| H-033 | Hammad | 4 | Bulk Actions + People Power Features | PRD 6.3 |
| H-034 | Hammad | 4 | Sprint 4 Polish + Full Integration Tests | — |

**Total: 18 new tickets across Sprint 3 & 4 | Estimated: 4 weeks for 2 developers**

---

## DEPENDENCY ORDER (critical path)

```
T-021 (Teams Schema) ──► T-022 (Teams UI)
                    └──► T-023 (BU + User Assignment) ──► T-024 (Drag-drop + Org Chart)
                                                      └──► T-025 (Health UI + History)

H-021 (Secondary Reporting) ──► (independent, parallel with H-022)
H-022 (Policy Schema)       ──► H-023 (Policy UI) ──► H-024 (Workflows, uses policy events)
                                                   └──► H-031 (Sprint 4: Notifications, uses policy triggers)

T-031 (Locations Schema) ──► H-032 (Sprint 4: People location integration)
T-032 (Custom Fields)    ──► (independent, integrates with existing User + Dept forms)
T-033 (Integrations)     ──► H-031 (needs notification for sync failure)
```
