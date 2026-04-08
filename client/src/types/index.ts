// src/types/index.ts

export interface Department {
  _id: string;                   // MongoDB ObjectId as string
  company_id: string;
  name: string;
  slug: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id: string | null;
  primary_manager_id: string | null;
  secondary_manager_id?: string | null;
  primary_manager?: { _id: string; full_name: string; avatar_url?: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Populated server-side when intelligence engine detects issues */
  has_intelligence_flag?: boolean;
  /** Count of active members */
  headcount?: number;
}

export interface CreateDepartmentInput {
  name: string;
  type: 'business_unit' | 'division' | 'department' | 'team' | 'cost_center';
  parent_id?: string | null;
  primary_manager_id?: string | null;
  secondary_manager_id?: string | null;
}

export interface UpdateDepartmentInput extends Partial<CreateDepartmentInput> {}

export interface OrgTreeNode extends Department {
  children?: OrgTreeNode[];
}

export interface Insight {
  _id: string;
  company_id: string;
  category: 'health' | 'misconfiguration' | 'recommendation' | 'data_consistency';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  reasoning?: string;
  affected_object_type?: string;
  affected_object_id?: string;
  affected_object_label?: string;
  remediation_url?: string;
  remediation_action?: string;
  is_resolved: boolean;
  detected_at: string;
  resolved_at?: string;
}

/** Filter state for the Organization page */
export interface DepartmentFilters {
  search: string;
  type: Department['type'] | '';
  status: 'active' | 'inactive' | '';
}

// ─────────────────────────────────────────────────────────────────────────────
// People / Users
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleState = 'invited' | 'onboarding' | 'active' | 'probation' | 'on_leave' | 'terminated' | 'archived';
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';

export interface User {
  _id: string;
  company_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  department_id?: string;
  department?: { _id: string; name: string; slug: string };
  team_id?: string;
  team?: { _id: string; name: string; slug: string };
  manager_id?: string;
  manager?: { _id: string; full_name: string; email: string; avatar_url?: string };
  lifecycle_state: LifecycleState;
  lifecycle_changed_at: string;
  hire_date?: string;
  termination_date?: string;
  employment_type: EmploymentType;
  location_id?: string;
  location?: { _id: string; name: string };
  custom_fields: Record<string, unknown>;
  last_login?: string;
  mfa_enabled: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Virtual field: array of role names/IDs — populated by server if requested */
  roles?: Array<{ _id: string; name: string }>;
}

export interface InviteUserInput {
  full_name: string;
  email: string;
  phone?: string;
  department_id?: string | null;
  team_id?: string | null;
  manager_id?: string | null;
  employment_type?: EmploymentType;
  hire_date?: string | null;
  location_id?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateUserInput {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  department_id?: string | null;
  team_id?: string | null;
  manager_id?: string | null;
  employment_type?: EmploymentType;
  hire_date?: string | null;
  termination_date?: string | null;
  location_id?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface UpdateLifecycleInput {
  lifecycle_state: LifecycleState;
}

export interface BulkInviteRow {
  full_name: string;
  email: string;
  phone?: string;
  department_id?: string;
  team_id?: string;
  manager_id?: string;
  employment_type?: EmploymentType;
  hire_date?: string;
  location_id?: string;
  custom_fields?: Record<string, unknown>;
}

export interface BulkInviteInput {
  users: BulkInviteRow[];
}

export interface BulkInviteResult {
  row: number;
  email: string;
  success: boolean;
  employee_id?: string;
  error?: string;
}

export interface BulkInviteResponse {
  total: number;
  successful: number;
  failed: number;
  results: BulkInviteResult[];
}

/** Filter state for the People page */
export interface UserFilters {
  search: string;
  lifecycle_state: LifecycleState | '';
  department_id: string;
  employment_type: EmploymentType | '';
}

/** Role types for RBAC */
export interface Role {
  _id: string;
  company_id: string;
  name: string;
  description?: string;
  type: 'system' | 'custom';
  parent_role_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  granted_permissions_count?: number;
}

export interface Permission {
  _id: string;
  module: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'export';
  data_scope: 'own' | 'department' | 'all';
}

export interface RolePermission {
  _id?: string;
  role_id: string;
  permission_id: string;
  granted: boolean;
}

export interface ResolvedPermission {
  module: string;
  action: string;
  data_scope: string;
  granted: boolean;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  type?: 'system' | 'custom';
  parent_role_id?: string;
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  parent_role_id?: string;
  is_active?: boolean;
}

export interface PermissionUpdate {
  permission_id: string;
  granted: boolean;
}

export interface PermissionMatrixData {
  modules: string[];
  actions: string[];
  data_scopes: string[];
  permissions: Map<string, Permission>;
}

/** App types for App Assignment */
export interface App {
  _id: string;
  company_id: string;
  name: string;
  slug: string;
  description?: string;
  icon_url?: string;
  category: string;
  provider?: string;
  status: 'active' | 'inactive' | 'maintenance';
  is_system_app: boolean;
  is_active: boolean;
  dependencies?: string[];
  created_at: string;
  updated_at: string;
  assignment_count?: number;
}

export interface AppAssignment {
  _id: string;
  company_id: string;
  app_id: string;
  target_type: 'role' | 'department' | 'group' | 'user';
  target_id: string;
  granted_by: string;
  granted_at: string;
  revoked_by?: string;
  revoked_at?: string;
  is_active: boolean;
  reason?: string;
  created_at: string;
  updated_at: string;
  granted_by_info?: { full_name: string; email: string };
  revoked_by_info?: { full_name: string; email: string };
}

export interface AssignAppInput {
  target_type: 'role' | 'department' | 'group' | 'user';
  target_id: string;
  reason?: string;
}

export interface DependencyCheckResult {
  has_dependencies: boolean;
  dependencies_met: boolean;
  required?: string[];
  assigned?: string[];
  missing?: string[];
}

export interface AssignmentTimelineEntry {
  assignment: AppAssignment;
  action: 'granted' | 'revoked';
  timestamp: string;
  actor?: { full_name: string; email: string };
}
