# ADMIN CENTER — Cursor Rules
# MERN Stack | React 18 + TypeScript + Vite | Express.js + Node.js | MongoDB + Mongoose | Phase 1: MVP

## IDENTITY
You are an expert MERN stack engineer building the Admin Center — a Business Operating System control plane.

**Frontend Stack:** React 18, TypeScript (strict), Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query v5, TanStack Table v8, react-hook-form, zod, sonner (toasts), lucide-react.

**Backend Stack:** Node.js, Express.js, TypeScript, MongoDB, Mongoose, JWT (access + refresh tokens), Nodemailer/SendGrid.

**Design System:** DM Sans font · Amber-orange primary (#E8870A) · Deep navy sidebar (#0F1629) · Light gray canvas (#F7F8FA) — see admin-frontend-guidelines.md for full tokens.

---

## ABSOLUTE RULES — NEVER VIOLATE THESE

### Frontend forbidden patterns:
- NEVER call the Express API directly inside a component or page → always through a hook in `src/features/`
- NEVER use `any` type → use `unknown` or define the proper interface
- NEVER hardcode colors or hex values → always use Tailwind classes from the design token system in theme.ts
- NEVER use `useState` + `useEffect` to fetch data → use TanStack Query `useQuery` / `useMutation`
- NEVER store server data in Zustand → Zustand is for auth session, UI state, and modal state only
- NEVER use `<img>` tags directly → use `<img>` with explicit `width` and `height` or a custom Image component
- NEVER hardcode route strings → use `ROUTES` constants from `@/constants/routes`
- NEVER render a list without loading, error, and empty states
- NEVER use colors not defined in `src/constants/theme.ts` — especially no hardcoded hex values

### Backend forbidden patterns:
- NEVER query MongoDB without `company_id` filter → every query must be scoped to the tenant
- NEVER skip the `auditLogger.log()` call in any mutation handler → every write produces an audit event
- NEVER expose JWT secret or any secret in response bodies or logs
- NEVER write to `audit_events` collection from client code → server-only via auditLogger
- NEVER perform a DELETE or UPDATE on `audit_events` — it is immutable, and no such routes exist
- NEVER trust `company_id` from the request body → always use `req.user.company_id` from JWT middleware
- NEVER return raw Mongoose errors to the client → always use `AppError` with meaningful message

---

## FILE & FOLDER STRUCTURE

### Frontend (client/)
```
client/
  src/
    main.tsx                       → React entry point
    App.tsx                        → Router + Providers
    components/
      layout/
        AdminShell.tsx             → Sidebar + TopBar wrapper
        Sidebar.tsx
        TopBar.tsx
      ui/                          → Shared atomic components
        DataTable.tsx
        StatusBadge.tsx
        InsightCard.tsx
        UserAvatar.tsx
        FilterBar.tsx
        EmptyState.tsx
        ErrorState.tsx
        TableSkeleton.tsx
        ConfirmDialog.tsx
        PermissionGate.tsx
        OrgChart.tsx
        Modal.tsx
    constants/
      theme.ts                     → Design tokens (THE source of truth for all colors)
      queryKeys.ts                 → TanStack Query key factory
      routes.ts                    → All route constants
      permissions.ts               → All permission definitions
    features/
      organization/
        hooks/
          useDepartments.ts
          useDepartmentDetail.ts
          useCreateDepartment.ts
          useUpdateDepartment.ts
          useDeleteDepartment.ts
          useOrgTree.ts
        components/
          DepartmentTable.tsx
          DepartmentForm.tsx
          OrgChartView.tsx
          DepartmentPanel.tsx
      people/
        hooks/
          useUsers.ts
          useUserDetail.ts
          useInviteUser.ts
          useUpdateUser.ts
          useUpdateLifecycle.ts
          useBulkInvite.ts
        components/
          UserTable.tsx
          UserForm.tsx
          InviteModal.tsx
          LifecycleStateSelector.tsx
          IdentityHealthBadge.tsx
      roles/
        hooks/
          useRoles.ts
          usePermissions.ts
          useRolePermissions.ts
          useUpdateRolePermissions.ts
          usePermissionSimulator.ts
        components/
          RolesTable.tsx
          PermissionMatrix.tsx
          PermissionSimulator.tsx
          AccessMapView.tsx
      apps/
        hooks/
          useApps.ts
          useAppAssignments.ts
          useAssignApp.ts
          useRevokeApp.ts
        components/
          AppCatalog.tsx
          AssignmentRuleBuilder.tsx
          AccessTimeline.tsx
      overview/
        hooks/
          useDashboardStats.ts
          useInsights.ts
          useRecentActivity.ts
          useSetupProgress.ts
        components/
          HealthCard.tsx
          InsightPanel.tsx
          RecentActivityFeed.tsx
          SetupProgressCard.tsx
      audit/
        hooks/
          useAuditEvents.ts
          useExportAuditLog.ts
        components/
          AuditLogTable.tsx
          AuditEventDetail.tsx
          AuditFilters.tsx
    lib/
      apiClient.ts                 → Axios instance with auth interceptors
      rbac.ts                      → Permission check helpers (client-side)
      queryClient.ts               → TanStack Query client config
    pages/
      overview/OverviewPage.tsx
      organization/OrganizationPage.tsx
      people/PeoplePage.tsx
      roles/RolesPage.tsx
      apps/AppsPage.tsx
      policies/PoliciesPage.tsx
      workflows/WorkflowsPage.tsx
      locations/LocationsPage.tsx
      security/SecurityPage.tsx
      data-fields/DataFieldsPage.tsx
      notifications/NotificationsPage.tsx
      integrations/IntegrationsPage.tsx
      audit-logs/AuditLogsPage.tsx
      auth/LoginPage.tsx
    services/
      toast.ts                     → Sonner wrapper
      logger.ts                    → Sentry wrapper
    store/
      useAuthStore.ts              → Session, role, company_id
      useUIStore.ts                → Modal states, sidebar state
    types/
      index.ts                     → All shared interfaces
    utils/
      formatDate.ts
      formatters.ts
      cn.ts                        → tailwind-merge + clsx utility
```

### Backend (server/)
```
server/
  src/
    index.ts
    app.ts
    config/
      db.ts
      env.ts
    middleware/
      auth.ts
      requireRole.ts
      errorHandler.ts
      rateLimiter.ts
    routes/               → One file per module
    controllers/          → One file per module
    models/               → One Mongoose model per collection
    lib/
      auditLogger.ts
      rbac.ts
      lifecycle.ts
      intelligence.ts
      tokenService.ts
      emailService.ts
    utils/
      AppError.ts
      asyncHandler.ts
      slugify.ts
    types/
      express.d.ts
      index.ts
```

---

## NAMING CONVENTIONS

- **Pages:** `PascalCase` + `Page` suffix → `OrganizationPage.tsx`
- **Hooks:** `camelCase` + `use` prefix → `useDepartments.ts`
- **Components:** `PascalCase` → `DepartmentTable.tsx`
- **Types:** `PascalCase` → `Department`, `User`, `Role`
- **Constants:** `SCREAMING_SNAKE_CASE` → `QUERY_KEYS`, `ROUTES`
- **MongoDB IDs:** always `_id` (not `id`) — use a helper to normalize if needed
- **API routes:** RESTful → `GET /api/v1/organization`, `POST /api/v1/organization`, `PUT /api/v1/organization/:id`

---

## TYPESCRIPT RULES

```typescript
// CORRECT — explicit interfaces, no any
interface Department {
  _id: string;                   // MongoDB ObjectId as string
  company_id: string;
  name: string;
  slug: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id: string | null;
  primary_manager_id: string | null;
  primary_manager?: { _id: string; full_name: string; avatar_url?: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// WRONG
const dept: any = await fetchDept();
```

- All hook return types must be explicit
- Zod schemas for all form inputs — validate before sending to API
- All API response shapes typed in `src/types/index.ts`

---

## DATA FETCHING — FRONTEND

All API calls go through the shared Axios client. Never use `fetch` directly.

```typescript
// src/lib/apiClient.ts
import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1',
  withCredentials: true, // for httpOnly cookie (refresh token)
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      // call /auth/refresh → get new access token → retry
    }
    return Promise.reject(err);
  }
);
```

```typescript
// src/features/organization/hooks/useDepartments.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import type { Department } from '@/types';

/**
 * Fetches all active departments for the current company.
 * Used on: OrganizationPage, DepartmentTable.
 * Company scoping handled server-side via JWT middleware.
 */
export const useDepartments = () => {
  return useQuery<Department[]>({
    queryKey: QUERY_KEYS.DEPARTMENTS,
    queryFn: async () => {
      const { data } = await apiClient.get('/organization');
      return data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
};
```

---

## MUTATIONS — FRONTEND

Every mutation that writes data must call invalidateQueries and show a toast:

```typescript
// src/features/organization/hooks/useCreateDepartment.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { toast } from '@/services/toast';
import { logger } from '@/services/logger';
import type { Department, CreateDepartmentInput } from '@/types';

export const useCreateDepartment = () => {
  const queryClient = useQueryClient();

  return useMutation<Department, Error, CreateDepartmentInput>({
    mutationFn: async (input) => {
      const { data } = await apiClient.post('/organization', input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.DEPARTMENTS });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ORG_TREE });
      toast.success('Department created');
    },
    onError: (error) => {
      logger.error('Department creation failed', { error });
      toast.error('Failed to create department. Please try again.');
    },
  });
};
```

---

## STATE MANAGEMENT

- **Zustand** = auth (accessToken, userRole, companyId), UI (modal open/close, sidebar collapsed)
- **TanStack Query** = all server state (departments, users, roles, audit events from API)
- **React useState** = local form state, component-level UI toggles

```typescript
// src/store/useAuthStore.ts
interface AuthState {
  accessToken: string | null;
  companyId: string | null;
  userRole: AdminRole | null;
  userId: string | null;
  userEmail: string | null;
  isLoading: boolean;
  setAuth: (payload: Omit<AuthState, 'isLoading' | 'setAuth' | 'clearAuth'>) => void;
  clearAuth: () => void;
}
```

---

## PERMISSION CHECKS — FRONTEND

```tsx
import { PermissionGate } from '@/components/ui/PermissionGate';

// Element-level gating
<PermissionGate module="organization" action="create">
  <Button onClick={openCreateModal}>Create Department</Button>
</PermissionGate>

// Programmatic check
import { useHasPermission } from '@/lib/rbac';
const canExport = useHasPermission('people', 'export');
```

---

## BACKEND CONTROLLER PATTERN

```typescript
// Every controller follows this exact pattern
import { asyncHandler } from '../utils/asyncHandler';

export const createDepartment = asyncHandler(async (req, res) => {
  // 1. Validate input (zod)
  const CreateSchema = z.object({ name: z.string() });
  const input = CreateSchema.parse(req.body);

  // 2. Use req.user.company_id — NEVER req.body.company_id
  const dept = await Department.create({
    ...input,
    company_id: req.user.company_id,
  });

  // 3. MANDATORY: audit log
  await auditLogger.log({
    req,
    action: 'department.created',
    module: 'organization',
    object_type: 'Department',
    object_id: dept._id.toString(),
    object_label: dept.name,
    before_state: null,
    after_state: dept.toObject(),
  });

  // 4. Return structured response
  res.status(201).json({ success: true, data: dept });
});
```

---

## AUDIT LOGGING — BACKEND

Every mutation (POST, PUT, DELETE) must call auditLogger. No exceptions.

```typescript
// Action naming convention: 'module.verb'
// Examples:
'department.created'
'department.updated'
'department.archived'
'user.invited'
'user.lifecycle_changed'
'role.permission_added'
'role.permission_removed'
'app.assigned'
'app.revoked'
'policy.published'
'security_policy.updated'
```

---

## ERROR HANDLING — BACKEND

```typescript
// Throw AppError for known errors
throw new AppError('Department not found', 404, 'NOT_FOUND');
throw new AppError('Unauthorized — insufficient permissions', 403, 'FORBIDDEN');
throw new AppError('Invalid lifecycle transition', 400, 'INVALID_TRANSITION');

// errorHandler middleware catches everything and returns:
// { error: string, code: string } with appropriate HTTP status
```

---

## ROUTES CONSTANTS — FRONTEND

```typescript
// src/constants/routes.ts
export const ROUTES = {
  OVERVIEW: '/overview',
  ORGANIZATION: '/organization',
  DEPARTMENT_DETAIL: (id: string) => `/organization/${id}`,
  PEOPLE: '/people',
  USER_DETAIL: (id: string) => `/people/${id}`,
  ROLES: '/roles',
  ROLE_DETAIL: (id: string) => `/roles/${id}`,
  APPS: '/apps',
  POLICIES: '/policies',
  POLICY_DETAIL: (id: string) => `/policies/${id}`,
  WORKFLOWS: '/workflows',
  LOCATIONS: '/locations',
  SECURITY: '/security',
  DATA_FIELDS: '/data-fields',
  NOTIFICATIONS: '/notifications',
  INTEGRATIONS: '/integrations',
  AUDIT_LOGS: '/audit-logs',
  LOGIN: '/login',
} as const;
```

---

## QUERY KEYS FACTORY

```typescript
// src/constants/queryKeys.ts
export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
  USERS: ['users'] as const,
  USERS_FILTERED: (filters: Record<string, unknown>) => ['users', filters] as const,
  USER_DETAIL: (id: string) => ['user', id] as const,
  ROLES: ['roles'] as const,
  PERMISSIONS: ['permissions'] as const,
  ROLE_PERMISSIONS: (roleId: string) => ['role', roleId, 'permissions'] as const,
  APPS: ['apps'] as const,
  APP_ASSIGNMENTS: (appId: string) => ['app', appId, 'assignments'] as const,
  DASHBOARD_STATS: ['dashboard', 'stats'] as const,
  INSIGHTS: ['insights'] as const,
  RECENT_ACTIVITY: ['audit', 'recent'] as const,
  AUDIT_EVENTS: (filters: Record<string, unknown>) => ['audit', 'events', filters] as const,
  POLICIES: ['policies'] as const,
  LOCATIONS: ['locations'] as const,
  CUSTOM_FIELDS: (targetObject: string) => ['custom-fields', targetObject] as const,
} as const;
```

---

## HOW TO USE WITH CURSOR (Tayyab / Hammad Workflow)

When asking AI to implement a ticket, paste this prompt:

```
Read admin-cursorrules.md, admin-backend-structure.md, and admin-frontend-guidelines.md.
I am [Tayyab / Hammad].
Implement Ticket [TICKET-ID]: [TICKET TITLE].
This is [organization / people / roles / audit] module work.
Acceptance criteria: [paste criteria from implementation-plan.md].
```

- **Tayyab tickets:** organization, roles, apps, overview modules
- **Hammad tickets:** people, security, audit logs, lifecycle engine

---

## PHASE 1 SCOPE GUARD

If asked to build anything below, respond: "This is Phase 2 scope. Create the file but leave implementation as a TODO stub."

- Drag-and-drop visual workflow canvas
- AI/ML-powered intelligence
- Integrations marketplace
- Advanced security anomaly detection
- SSO / SAML provider configuration
- Mobile admin views

---

## WHEN GENERATING CODE, ALWAYS:
1. Add the file path as a comment on line 1: `// src/features/organization/hooks/useDepartments.ts`
2. Import from `@/` aliases on frontend, never relative paths
3. Export named exports (not default) except for page components
4. Add JSDoc on every exported function: what it does + which page uses it
5. Include all four states in every page: loading (skeleton), error, empty, data
6. Fire audit log in every backend mutation controller
7. Use `req.user.company_id` in every MongoDB query — never trust request body for company_id
8. Use design tokens from theme.ts — never hardcode colors
9. Always type API responses explicitly — never use `any`
10. Use `asyncHandler` wrapper on every Express controller — no bare try/catch
