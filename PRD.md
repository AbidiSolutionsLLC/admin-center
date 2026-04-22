# ADMIN CENTER — Product Requirements Document
> The definitive product spec for the Business Operating System Admin Portal.
> Feed this to Cursor when building any module so it understands the full scope and requirements.

**Version:** 3.0
**Status:** Approved for Development — Sprint 1
**Stack:** MERN — MongoDB · Express.js · React 18 · Node.js · TypeScript · Tailwind CSS · shadcn/ui · Zustand · TanStack Query v5

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [User Personas](#4-user-personas)
5. [System Architecture](#5-system-architecture)
6. [Module Specifications](#6-module-specifications)
   - 6.1 [Overview Dashboard](#61-overview-dashboard)
   - 6.2 [Organization](#62-organization)
   - 6.3 [People Identity & User Control](#63-people-identity--user-control)
   - 6.4 [Roles, Groups & Permissions](#64-roles-groups--permissions)
   - 6.5 [App Assignment](#65-app-assignment)
   - 6.6 [Policies](#66-policies)
   - 6.7 [Workflows & Automation](#67-workflows--automation)
   - 6.8 [Locations & Context](#68-locations--context)
   - 6.9 [Security & Compliance](#69-security--compliance)
   - 6.10 [Data & Custom Fields](#610-data--custom-fields)
   - 6.11 [Notifications](#611-notifications)
   - 6.12 [Integrations](#612-integrations)
   - 6.13 [Audit Logs](#613-audit-logs)
   - 6.14 [Intelligence Layer](#614-intelligence-layer)
7. [Non-Functional Requirements](#7-non-functional-requirements)
8. [MVP Scope](#8-mvp-scope)
9. [Success Metrics](#9-success-metrics)

---

## 1. EXECUTIVE SUMMARY

The Admin Center is the control plane for a Business Operating System (BOS). It gives company administrators a single, intelligent surface to define organizational structure, manage user identity and lifecycle, control access, assign applications, enforce policies, automate workflows, and audit all system activity.

The north star is a **clean, intelligent control system** — not a settings dump, not a legacy HR backend. Every screen must surface actionable insight, not raw configuration.

---

## 2. PROBLEM STATEMENT

Existing enterprise admin tools (Zoho, legacy HRMs) suffer from three core problems:

- **Configuration overload** with no actionable insight — admins drown in settings with no guidance on what matters.
- **Fragmented control** across disconnected modules — a permission change in one place does not cascade correctly to others.
- **No intelligence layer** — the system never tells you what's wrong; you discover it when something breaks.

The result: permission errors, compliance blind spots, and weeks-long onboarding. This product solves all three.

---

## 3. GOALS & NON-GOALS

### Goals
- Define company structure with full hierarchy support
- Manage user identity from invite through archive
- Enforce access control via a deterministic RBAC engine
- Assign applications dynamically based on role/group/department rules
- Configure and version operational policies
- Secure the system with auth controls and session management
- Provide an immutable, exportable audit trail of all activity
- Extend data models without code changes via a schema builder
- Surface proactive system health insights via rule-based intelligence

### Non-Goals (Phase 1 — do not build)
- Drag-and-drop visual workflow builder (Phase 2)
- AI/ML-powered intelligence — rule-based only in MVP
- Integrations marketplace — max 3 pre-built connectors in MVP
- Advanced security anomaly detection engine (Phase 2)
- SSO / SAML (Phase 2)
- Mobile-native admin app (Phase 2)

---

## 4. USER PERSONAS

### Primary Personas

| Persona | Role | Primary Use Cases |
|---|---|---|
| **Company Admin (Super Admin)** | Full system access | Initial setup, global configuration, all modules |
| **HR Admin** | People and lifecycle management | User creation, lifecycle states, custom fields |
| **IT Admin** | Security, apps, access control | RBAC, app assignment, session management, security policies |
| **Operations Admin** | Org structure, locations, policies | Department/team hierarchy, locations, operational policies |

### Secondary Personas

| Persona | Role | Primary Use Cases |
|---|---|---|
| **Manager** | Read-only team view + limited approvals | View team org chart, approve workflows directed to them |
| **Security / Compliance Officer** | Audit + read-only access | Audit log export, security monitoring, access map review |

### Primary User (Most Important Persona): **Tayyab (Company Admin)**
- Sets up the system for the first time
- Needs the setup flow to be guided, not overwhelming
- Values speed of setup over depth of configuration
- Will use the Intelligence Layer to find and fix gaps

---

## 5. SYSTEM ARCHITECTURE

### Stack Overview

```
Frontend:  React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
Backend:   Node.js + Express.js + TypeScript
Database:  MongoDB (Mongoose ODM)
Auth:      JWT (access token + refresh token) stored in httpOnly cookies
State:     Zustand (client UI) + TanStack Query v5 (server state)
```

### Core MongoDB Collections

```
companies
departments
users
roles
groups
group_members
permissions
role_permissions
user_roles
apps
app_assignments
policies
policy_assignments
workflows
workflow_steps
locations
audit_events
custom_fields
custom_field_values
notification_templates
notification_events
insights
pending_session_revocations
security_events
security_policies
```

### Key Relationships

```
Company → Department(s) → Team(s)
User → Department → Team
User → Role(s) → Permissions
Role → AppAccess
Policy → applied via conditions (role / department / location)
Workflow → triggered by lifecycle events
AuditEvent → logs every write operation with before/after state
```

### Three Cross-Cutting Engines

| Engine | Responsibility | Lives In |
|---|---|---|
| **RBAC Engine** | Resolves effective permissions deterministically (module + action + data level) | `src/lib/rbac.ts` |
| **Lifecycle Engine** | Triggers downstream actions on user state transitions | `src/lib/lifecycle.ts` |
| **Intelligence Layer** | Rule-based system health scoring, risk detection, recommendations | `src/lib/intelligence.ts` |

### Navigation Structure

```
Admin Center (/)
│
├── /overview               → Dashboard + Intelligence Panel
├── /organization           → Org Hierarchy CRUD + Org Chart
├── /people                 → User Management + Lifecycle
├── /roles                  → RBAC + Permission Matrix
├── /apps                   → App Catalog + Assignment Rules
├── /policies               → Policy Builder + Versioning
├── /workflows              → Workflow Builder + Approvals
├── /locations              → Office/Region Management
├── /security               → Auth Controls + Session Management
├── /data-fields            → Custom Schema Builder
├── /notifications          → Notification Templates + Triggers
├── /integrations           → External Connectors
└── /audit-logs             → Immutable Activity Log
```

### Authentication Model

JWT-based auth with access + refresh token rotation.

```typescript
// Payload stored in JWT
type AdminClaim = {
  userId: string;
  user_role: 'super_admin' | 'hr_admin' | 'it_admin' | 'ops_admin' | 'manager' | 'compliance';
  company_id: string; // Multi-tenancy — all queries scoped to this
};

// Access token: 15 minutes
// Refresh token: 7 days, stored in httpOnly cookie
// On every API request: middleware verifies JWT and injects company_id into req
```

---

## 6. MODULE SPECIFICATIONS

---

### 6.1 OVERVIEW DASHBOARD

**Purpose:** System health at a glance with actionable intelligence. The first screen admins see. Must make setup progress obvious and surface the most critical issues immediately.

#### Features
- Setup progress tracker (percentage + step list)
- Health stat cards: Total Users, Active Users, Roles, Open Insights
- Intelligence insight panel: critical issues, warnings, info grouped by severity
- Recent activity feed (last 10 audit events)
- Quick action buttons: Invite User, Create Department, Assign Role

#### Acceptance Criteria
- [ ] Dashboard loads all stat cards in under 200ms
- [ ] Intelligence panel shows insights sorted by severity (critical → warning → info)
- [ ] Setup progress card reflects real completion state from all modules
- [ ] Recent activity feed shows last 10 events with actor, action, timestamp

---

### 6.2 ORGANIZATION

**Purpose:** Define and manage the company's legal and operational hierarchy.

#### Data Model
```
Company → LegalEntity → Division → Department → Team → CostCenter
```

#### Features
- Full CRUD for departments (all types: business_unit, division, department, team, cost_center)
- Assign primary manager + secondary manager per department
- Tree view (org chart) + list view toggle
- Drag-to-restructure org hierarchy (drag node to new parent)
- Headcount auto-computed from user assignments
- Department health flags surfaced from Intelligence Layer

#### Acceptance Criteria
- [ ] Create/edit/archive department with all fields
- [ ] Org chart renders hierarchy up to 8 levels deep
- [ ] Manager assignment reflects in user profiles
- [ ] Intelligence warnings shown on nodes with issues (missing manager, etc.)

---

### 6.3 PEOPLE IDENTITY & USER CONTROL

**Purpose:** Manage the full user lifecycle from invitation to archival.

#### Lifecycle States
```
invited → onboarding → active → [probation | on_leave] → terminated → archived
```

#### Features
- Invite single user (email) or bulk invite via CSV upload
- User profile: personal info, employment info, department, role, custom fields
- Lifecycle state management with transition validation
- Identity health badge (role assigned? dept assigned? login recent?)
- Bulk actions: change lifecycle state, assign role, export

#### Acceptance Criteria
- [ ] Invite flow sends welcome email via Nodemailer/SendGrid
- [ ] Lifecycle transitions validated against `VALID_TRANSITIONS` map
- [ ] Bulk CSV import supports up to 500 rows with preview
- [ ] All mutations produce audit log entries

---

### 6.4 ROLES, GROUPS & PERMISSIONS

**Purpose:** Enforce access control via deterministic RBAC.

#### Permission Model
```
Role → Permissions (module × action × data_scope)
action: create | read | update | delete | export
data_scope: own | department | all
```

#### Features
- Role CRUD with permission matrix editor
- Permission Matrix: modules as rows, actions as columns, checkbox grid
- Role inheritance (parent_role_id)
- Permission simulator: "What can [user] do in [module]?"
- Group management (static + dynamic membership rules)
- Access map: view all users and their effective permissions

#### Acceptance Criteria
- [ ] Permission matrix saves all changes in one batch request
- [ ] RBAC engine resolves conflicts correctly (deny overrides grant)
- [ ] Permission simulator returns correct effective permissions for any user
- [ ] Role deletion blocked if users are assigned to it

---

### 6.5 APP ASSIGNMENT

**Purpose:** Control which users have access to which applications.

#### Assignment Types
```
Role-based | Group-based | Department-based | Individual
```

#### Features
- App catalog: list all registered apps with status
- Assignment rule builder: assign app to role/group/department
- Individual assignment override
- Access timeline per user (when was each app granted/revoked)
- Dependency management: apps can declare dependencies (App A requires App B)

#### Acceptance Criteria
- [ ] App assignment to role propagates to all users with that role
- [ ] Individual overrides override rule-based assignments
- [ ] App dependency warning shown when assigning an app whose dependency is unmet
- [ ] Access timeline shows full history per user

---

### 6.6 POLICIES

**Purpose:** Create and enforce operational policies (leave, attendance, IT usage, etc.)

#### Features
- Policy builder with type: leave | attendance | remote_work | it_usage | security
- Target by: role, department, location, lifecycle state, with AND/OR logic
- Versioning: every published policy creates a new version (immutable)
- Acknowledgment tracking: require user sign-off per policy
- Active/draft/archived status

#### Acceptance Criteria
- [ ] Policy publishing creates a new version (old version not modified)
- [ ] Targeting engine correctly resolves which users a policy applies to
- [ ] Acknowledgment required flag triggers user notification
- [ ] Policy diff view shows changes between versions

---

### 6.7 WORKFLOWS & AUTOMATION

**Purpose:** Automate actions triggered by lifecycle and system events.

> **MVP:** Pre-defined trigger/action pairs only. No visual canvas (Phase 2).

#### Features
- Workflow list: name, trigger event, status (active/draft)
- Trigger types: user lifecycle state change, new user invite, role change, policy publish
- Action types: send email, assign role, create audit event, call webhook
- Enable/disable workflows
- Workflow run history log

#### Acceptance Criteria
- [ ] Workflow triggers correctly on defined events
- [ ] Run history shows each execution with status (success/failed)
- [ ] Failed workflows surface in Intelligence Layer as a warning

---

### 6.8 LOCATIONS & CONTEXT

**Purpose:** Define physical and regional presence for policy and compliance context.

#### Features
- Location hierarchy: Region → Country → City → Office
- Timezone assignment (IANA timezone string)
- Headquarters flag
- Working hours per location
- Assign users to locations
- Used by policy targeting engine

#### Acceptance Criteria
- [ ] Location hierarchy renders in tree view
- [ ] Timezone saved as IANA string and displayed correctly in UI
- [ ] User location assignment reflects in user profile and policy targeting

---

### 6.9 SECURITY & COMPLIANCE

**Purpose:** Control authentication security, session management, and monitor access events.

#### Features
- Password policy: min length, complexity, expiry, history
- Session management: timeout, max concurrent sessions
- MFA requirements per role
- Active session viewer with force-logout action
- Security event log: login attempts, suspicious activity flags
- Suspicious login detection: 5+ failures in 10 minutes

#### Acceptance Criteria
- [ ] Password policy saved and enforced on next auth attempt
- [ ] Force logout calls backend session invalidation endpoint
- [ ] Security events logged for all login attempts
- [ ] Suspicious login events flagged with `is_suspicious: true`

---

### 6.10 DATA & CUSTOM FIELDS

**Purpose:** Extend data models without code changes.

#### Supported Field Types
```
text | number | date | boolean | select (single) | multi_select | url | email | phone
```

#### Features
- Custom field builder: create fields for User, Department, or Policy objects
- Field ordering (drag to reorder)
- Required/optional flag
- Custom field values stored on the target object's `custom_fields` map
- Field-level permissions: who can see/edit each field

#### Acceptance Criteria
- [ ] New fields appear in user profile form immediately after creation
- [ ] Field permissions enforced at API middleware
- [ ] Adding a new field does not break existing records (defaults to null)
- [ ] Schema changes require no database migration

---

### 6.11 NOTIFICATIONS

**Purpose:** Keep admins and users informed of system events via email and in-app channels.

#### Features
- Event-based triggers: lifecycle events, approval actions, policy changes
- Delivery channels: email (Nodemailer + SendGrid/Resend) and in-app notification center
- Template editor with variable substitution: `{{user.full_name}}`, `{{department.name}}`, `{{company.name}}`
- Digest settings: immediate | hourly | daily per notification type
- Critical alert override: bypasses digest settings

#### Acceptance Criteria
- [ ] Variable substitution renders correctly for all supported tokens
- [ ] Critical alerts deliver within 60 seconds
- [ ] In-app notifications appear in real-time via WebSocket or polling

---

### 6.12 INTEGRATIONS

**Purpose:** Connect external systems for data sync and identity federation.

> **MVP:** Maximum 3 pre-built connectors. Full marketplace is Phase 2.

**MVP Connectors:** Google Workspace, Slack, internal payroll stub

#### Features
- Secure connection via OAuth 2.0 or API key (stored encrypted in DB)
- Bidirectional user/data sync with configurable field mapping
- Sync logs: per-sync timestamp, row counts, success/failure status
- Error notifications on sync failure

#### Acceptance Criteria
- [ ] Credentials stored encrypted (bcrypt/AES) — never in plaintext
- [ ] Sync errors trigger admin notification within 60 seconds
- [ ] Sync logs visible in Integration detail view

---

### 6.13 AUDIT LOGS

**Purpose:** Provide a complete, tamper-proof record of all system activity.

```typescript
interface AuditEvent {
  _id: string;
  company_id: string;
  actor_id: string;
  actor_email: string;         // denormalized — preserved even if actor deleted
  action: string;              // e.g. 'user.created', 'role.permission_changed'
  module: ModuleSlug;
  object_type: string;
  object_id: string;
  object_label: string;        // denormalized name
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;            // immutable
}
```

#### Features
- Immutable event log — no delete or edit (enforced at API middleware: no DELETE/PUT route exists for audit_events)
- Multi-filter search: date range, actor, module, action type, object type
- CSV/JSON export with date range selection
- Before/after state diff view per entry

#### Acceptance Criteria
- [ ] All admin write actions logged synchronously in the same transaction
- [ ] No DELETE or PUT endpoint exists for audit_events collection
- [ ] Export available within 30 seconds for any date range up to 12 months
- [ ] Clicking a row shows before/after JSON diff

---

### 6.14 INTELLIGENCE LAYER

**Purpose:** Proactively surface system health risks and configuration gaps.

> **MVP:** Rule-based only. Zero ML dependency. All rules run as scheduled Node.js jobs or on-demand API calls.

#### Insight Schema

```typescript
interface Insight {
  _id: string;
  company_id: string;
  category: 'health' | 'misconfiguration' | 'recommendation' | 'data_consistency';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  reasoning: string;
  affected_object_type: string;
  affected_object_id: string;
  affected_object_label: string;
  remediation_url: string;
  remediation_action: string | null;
  is_resolved: boolean;
  detected_at: Date;
  resolved_at: Date | null;
}
```

#### MVP Rule Set
ADMIN-M3-025 — Venue Form — Section F (Pricing & Contact)
| Rule ID | Category | Severity | Condition |
|---|---|---|---|
| RULE-01 | health | critical | User has no role assigned AND lifecycle_state = 'active' |
| RULE-02 | health | critical | Department has headcount > 0 AND no primary_manager_id |
| RULE-03 | health | warning | User has no department assignment AND lifecycle_state = 'active' |
| RULE-04 | health | warning | User last_login > 90 days AND lifecycle_state = 'active' |
| RULE-05 | health | warning | Team has no parent department (orphan) |
| RULE-06 | misconfiguration | critical | Role has ALL permissions across ALL modules |
| RULE-07 | misconfiguration | warning | Admin account has no MFA enabled |
| RULE-08 | misconfiguration | warning | Two active policies target same user population with conflicting rules |
| RULE-09 | data_consistency | warning | Duplicate user detected (same full_name + email domain) |
| RULE-10 | recommendation | info | Setup progress < 50% after 7 days |

#### Acceptance Criteria
- [ ] All insights are rule-based — no external ML service dependency
- [ ] Insights refresh within 60 seconds of underlying data change (polling or event-driven)
- [ ] Each insight includes a `remediation_url` deep link to the affected record
- [ ] Dismissed insights do not reappear unless the underlying condition recurs

---

## 7. NON-FUNCTIONAL REQUIREMENTS

| Category | Requirement |
|---|---|
| **Performance** | Core page loads under 200ms (p95). API responses under 300ms for list endpoints. Intelligence refresh within 60 seconds. |
| **Security** | All data encrypted at rest (MongoDB encryption or field-level). JWT in httpOnly cookies. RBAC enforced at Express middleware layer. Sensitive fields never in logs. |
| **Multi-tenancy** | Full tenant isolation. Every DB query scoped by `company_id`. Express middleware enforces this — no bypass possible. |
| **Scalability** | Supports up to 50,000 users per tenant in Phase 1. MongoDB indexes on all frequently queried fields. |
| **Auditability** | Every admin write operation produces a synchronous audit event in the same request handler. |
| **Availability** | 99.9% uptime target. Intelligence Layer failures must not block core admin CRUD. |

---

## 8. MVP SCOPE

### Phase 1 (Sprint 1–4) — Build Now

| Module | Sprint | Developer |
|---|---|---|
| Project Setup + Design System | Sprint 1 | Tayyab |
| MongoDB Schema — Organization collections | Sprint 1 | Tayyab |
| Organization Module — Full CRUD | Sprint 1 | Tayyab |
| MongoDB Schema — User collections | Sprint 1 | Hammad |
| People Identity Module — Full CRUD | Sprint 1 | Hammad |
| Roles & Access Module | Sprint 2 | Tayyab |
| App Assignment Module | Sprint 2 | Tayyab |
| Security Module | Sprint 2 | Hammad |
| Audit Logs Module | Sprint 2 | Hammad |
| Overview Dashboard + Intelligence Layer | Sprint 3 | Both |

### Phase 2 — Deferred

- Visual drag-and-drop workflow builder canvas
- AI/ML-powered intelligence
- Integrations marketplace (beyond 3 connectors)
- Advanced security risk engine
- SSO / SAML
- Mobile admin app
- Advanced conditional logic builder
- Policy versioning diff view

---

## 9. SUCCESS METRICS

| Metric | Target |
|---|---|
| Company onboarding time (invite to active) | Under 30 minutes |
| Admin setup completion rate | Over 80% of companies |
| Permission error rate | Under 1% of active users |
| Intelligence insight action rate | Over 40% of surfaced insights |
| Audit log query response time | Under 500ms for any 12-month range |

---

*Start with admin-backend-structure.md to understand the MongoDB schema before building any module.*
