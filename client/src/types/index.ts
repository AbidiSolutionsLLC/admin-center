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
