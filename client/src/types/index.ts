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
  custom_fields: Record<string, unknown>;
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

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

export type LocationType = 'region' | 'country' | 'city' | 'office';

export interface Location {
  _id: string;
  company_id: string;
  name: string;
  type: LocationType;
  parent_id?: string | null;
  parent?: { _id: string; name: string; type: LocationType };
  timezone: string;
  is_headquarters: boolean;
  address?: string;
  working_hours?: {
    start: string;
    end: string;
    days: number[];
  };
  user_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LocationTreeNode extends Location {
  children?: LocationTreeNode[];
}

export interface CreateLocationInput {
  name: string;
  type: LocationType;
  parent_id?: string | null;
  timezone: string;
  is_headquarters?: boolean;
  address?: string | null;
  working_hours?: {
    start: string;
    end: string;
    days: number[];
  } | null;
}

export interface UpdateLocationInput extends Partial<CreateLocationInput> {}

export interface LocationFilters {
  search: string;
  type: LocationType | '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom Fields
// ─────────────────────────────────────────────────────────────────────────────

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox' | 'textarea';
export type TargetObject = 'user' | 'department' | 'policy';
export type VisibilityRule = 'all' | 'admin_only' | 'role_specific';

export interface CustomField {
  _id: string;
  company_id: string;
  name: string;
  slug: string;
  field_type: FieldType;
  target_object: TargetObject;
  label: string;
  placeholder?: string;
  description?: string;
  required: boolean;
  select_options?: string[];
  visibility: VisibilityRule;
  visible_roles?: string[];
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomFieldInput {
  name: string;
  field_type: FieldType;
  target_object: TargetObject;
  label: string;
  placeholder?: string | null;
  description?: string | null;
  required?: boolean;
  select_options?: string[] | null;
  visibility?: VisibilityRule;
  visible_roles?: string[] | null;
  display_order?: number;
}

export interface UpdateCustomFieldInput extends Partial<Omit<CreateCustomFieldInput, 'field_type'>> {}

export interface CustomFieldFilters {
  target_object: TargetObject | '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Integrations
// ─────────────────────────────────────────────────────────────────────────────

export type IntegrationType = 'slack' | 'jira' | 'google_workspace' | 'github' | 'custom';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error';
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed' | 'partial';
export type SyncFrequency = 'manual' | 'hourly' | 'daily' | 'weekly';

export interface Integration {
  _id: string;
  company_id: string;
  name: string;
  type: IntegrationType;
  status: IntegrationStatus;
  field_mapping: Record<string, string>;
  sync_enabled: boolean;
  sync_frequency: SyncFrequency;
  last_sync_at?: string;
  last_sync_status: SyncStatus;
  last_sync_message?: string;
  connected_at?: string;
  disconnected_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConnectIntegrationInput {
  type: IntegrationType;
  credentials: Record<string, unknown>;
  field_mapping?: Record<string, string>;
  sync_enabled?: boolean;
  sync_frequency?: SyncFrequency;
}

export interface UpdateIntegrationInput {
  credentials?: Record<string, unknown>;
  field_mapping?: Record<string, string>;
  sync_enabled?: boolean;
  sync_frequency?: SyncFrequency;
}

export interface IntegrationSyncLog {
  _id: string;
  company_id: string;
  integration_id: string;
  integration_type: string;
  triggered_by: 'manual' | 'schedule' | 'webhook';
  status: SyncStatus;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  records_processed?: number;
  records_created?: number;
  records_updated?: number;
  records_failed?: number;
  error_message?: string;
  created_at: string;
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
// Teams
// ─────────────────────────────────────────────────────────────────────────────

export interface Team {
  _id: string;
  company_id: string;
  name: string;
  slug: string;
  description?: string;
  department_id?: string | null;
  department?: { _id: string; name: string; slug: string };
  team_lead_id?: string | null;
  team_lead?: { _id: string; full_name: string; avatar_url?: string; email: string };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamInput {
  name: string;
  description?: string;
  department_id?: string | null;
  team_lead_id?: string | null;
}

export interface UpdateTeamInput extends Partial<CreateTeamInput> {}

export type TeamMemberRole = 'member' | 'lead' | 'admin';

export interface TeamMember {
  _id: string;
  company_id: string;
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  joined_at: string;
  created_at: string;
  updated_at: string;
  user?: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
    employee_id: string;
  };
}

export interface AddTeamMemberInput {
  user_id: string;
  role?: TeamMemberRole;
}

export interface UpdateTeamMemberInput {
  user_id?: string;
  role?: TeamMemberRole;
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
  secondary_manager_ids?: string[];
  secondary_managers?: Array<{ _id: string; full_name: string; email: string; avatar_url?: string }>;
  lifecycle_state: LifecycleState;
  lifecycle_changed_at: string;
  hire_date?: string;
  termination_date?: string;
  employment_type: EmploymentType;
  location_id?: string;
  location?: { _id: string; name: string; timezone?: string };
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

/** Overview Dashboard types */
export interface DashboardStats {
  users: {
    total: number;
    active: number;
    invited: number;
  };
  departments: {
    total: number;
  };
  apps: {
    total: number;
    active: number;
  };
  roles: {
    total: number;
    custom: number;
  };
}

export interface SetupProgressModule {
  key: string;
  label: string;
  completed: number;
  total: number;
  percentage: number;
}

export interface SetupProgress {
  overall_percentage: number;
  modules: SetupProgressModule[];
  total_checks: number;
  completed_checks: number;
}

export interface AuditEvent {
  _id: string;
  company_id: string;
  actor_id: string;
  actor_email: string;
  actor_name?: string;
  action: string;
  module: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state?: unknown;
  after_state?: unknown;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  time_ago?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityEventType =
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'mfa_challenge'
  | 'mfa_verified'
  | 'mfa_failed'
  | 'session_expired' | 'token_refresh' | 'token_revoked' | 'suspicious_activity_detected' | 'account_locked' | 'account_unlocked';

export interface SecurityEvent {
  _id: string;
  company_id: string;
  user_id?: string;
  user?: { _id: string; full_name: string; email: string };
  email?: string;
  event_type: SecurityEventType;
  ip_address?: string;
  user_agent?: string;
  is_suspicious: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface SecurityPolicySettings {
  max_failed_login_attempts: number;
  lockout_duration_minutes: number;
  session_timeout_minutes: number;
  require_mfa: boolean;
  password_min_length: number;
  password_require_uppercase: boolean;
  password_require_lowercase: boolean;
  password_require_numbers: boolean;
  password_require_special_chars: boolean;
  password_expiry_days: number;
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
}

export interface SecurityPolicy {
  _id: string;
  company_id: string;
  policy_name: string;
  description?: string;
  is_enabled: boolean;
  settings: SecurityPolicySettings;
  created_at: string;
  updated_at: string;
}

export interface UpdateSecurityPolicyInput {
  policy_name?: string;
  description?: string;
  is_enabled?: boolean;
  settings?: Partial<SecurityPolicySettings>;
}

export interface SecurityEventsResponse {
  events: SecurityEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reporting Lines
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportingLineData {
  user: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  primary_manager: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  } | null;
  secondary_managers: Array<{
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  }>;
  direct_reports: Array<{
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
    reports_as: 'primary' | 'secondary';
  }>;
}

export interface AddSecondaryManagerInput {
  manager_id: string;
}

export interface ChangePrimaryManagerInput {
  manager_id: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Policies
// ─────────────────────────────────────────────────────────────────────────────

export type PolicyCategory = 'hr' | 'it' | 'security' | 'compliance' | 'operations' | 'other';
export type PolicyStatus = 'draft' | 'published' | 'archived';

export type PolicyTargetType = 'all' | 'role' | 'department' | 'group' | 'user';

export interface PolicyAssignmentRule {
  _id: string;
  policy_version_id: string;
  target_type: PolicyTargetType;
  target_id: string;
  target_label: string; // Resolved name (e.g., department name, role name)
  created_at: string;
}

export interface PolicyVersion {
  _id: string;
  company_id: string;
  policy_key: string;
  title: string;
  content: string;
  version_number: number;
  status: PolicyStatus;
  category: PolicyCategory;
  effective_date: string;
  published_by?: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  published_at?: string;
  summary?: string;
  assignment_rules?: PolicyAssignmentRule[]; // Populated on detail view
  is_active: boolean;
  created_at: string;
  updated_at: string;
  version_count?: number; // Added when listing policies
}

export interface PolicyAcknowledgment {
  _id: string;
  user: {
    _id: string;
    full_name: string;
    email: string;
    avatar_url?: string;
  };
  acknowledged_at: string;
}

export interface AcknowledgmentStatus {
  acknowledged: boolean;
  acknowledged_at: string | null;
}

export interface PublishPolicyInput {
  title: string;
  content: string;
  category: PolicyCategory;
  effective_date: string;
  summary?: string;
  assignment_rules?: Array<{
    target_type: PolicyTargetType;
    target_id: string;
  }>;
}

export interface UpdatePolicyDraftInput {
  title?: string;
  content?: string;
  category?: PolicyCategory;
  effective_date?: string;
  summary?: string;
}

export interface ArchivePolicyInput {
  policy_id: string;
}

export interface AcknowledgePolicyInput {
  policy_version_id: string;
}

export interface PolicyConflictCheck {
  has_conflicts: boolean;
  conflicting_policies: Array<{
    policy_key: string;
    title: string;
    version_number: number;
    conflict_reason: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflows
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowTrigger = 'user.lifecycle_changed';
export type WorkflowStatus = 'draft' | 'enabled' | 'disabled';
export type WorkflowActionType =
  | 'send_email'
  | 'assign_role'
  | 'revoke_access'
  | 'notify_manager'
  | 'update_field'
  | 'create_task'
  | 'webhook';

export interface WorkflowTriggerConfig {
  lifecycle_from: string[];
  lifecycle_to: string[];
}

export interface Workflow {
  _id: string;
  company_id: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  trigger_config: WorkflowTriggerConfig;
  status: WorkflowStatus;
  is_active: boolean;
  created_by: {
    _id: string;
    full_name: string;
    email: string;
  };
  updated_by?: {
    _id: string;
    full_name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
  steps?: WorkflowStep[]; // Populated on detail view
}

export interface WorkflowStep {
  _id: string;
  company_id: string;
  workflow_id: string;
  name: string;
  description?: string;
  action_type: WorkflowActionType;
  action_config: Record<string, unknown>;
  step_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type WorkflowRunStatus = 'success' | 'failure' | 'partial';

export interface WorkflowRun {
  _id: string;
  company_id: string;
  workflow_id: string;
  triggered_by: string;
  triggered_by_object_id: string;
  triggered_by_label: string;
  status: WorkflowRunStatus;
  steps_executed: number;
  steps_succeeded: number;
  steps_failed: number;
  error_message?: string;
  execution_time_ms: number;
  created_at: string;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  trigger_config: WorkflowTriggerConfig;
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  trigger_config?: WorkflowTriggerConfig;
}

export interface CreateWorkflowStepInput {
  name: string;
  description?: string;
  action_type: WorkflowActionType;
  action_config?: Record<string, unknown>;
  step_order: number;
}

export interface ReorderStepsInput {
  steps: Array<{ step_id: string; step_order: number }>;
}

export interface TestWorkflowInput {
  user_id: string;
  user_name: string;
  user_email: string;
  lifecycle_from: string;
  lifecycle_to: string;
}

export interface WorkflowTestResult {
  runId: string;
  status: WorkflowRunStatus;
  stepsExecuted: number;
  stepsSucceeded: number;
  stepsFailed: number;
  stepResults: Array<{
    stepId: string;
    stepName: string;
    actionType: string;
    success: boolean;
    error?: string;
  }>;
  executionTimeMs: number;
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationChannel = 'email' | 'in_app' | 'both';
export type NotificationDigestMode = 'immediate' | 'hourly' | 'daily';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface NotificationTemplate {
  _id: string;
  company_id: string;
  name: string;
  key: string;
  description?: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  digest_mode: NotificationDigestMode;
  subject: string;
  body: string;
  trigger_event: string;
  is_active: boolean;
  created_by: {
    _id: string;
    full_name: string;
    email: string;
  };
  updated_by?: {
    _id: string;
    full_name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
}

export interface InAppNotification {
  _id: string;
  company_id: string;
  user_id: string;
  template_id?: {
    _id: string;
    key: string;
    severity: NotificationSeverity;
  };
  title: string;
  message: string;
  severity: NotificationSeverity;
  status: 'unread' | 'read';
  link_url?: string;
  read_at?: string;
  created_at: string;
}

export interface NotificationEvent {
  _id: string;
  company_id: string;
  template_id: {
    _id: string;
    name: string;
    key: string;
  };
  recipient_user_id?: {
    _id: string;
    full_name: string;
    email: string;
  };
  recipient_email?: string;
  channel: 'email' | 'in_app';
  status: 'pending' | 'sent' | 'failed' | 'queued_digest';
  subject_rendered?: string;
  body_rendered?: string;
  error_message?: string;
  triggered_by_event: string;
  delivery_timestamp: string;
}

export interface CreateNotificationTemplateInput {
  name: string;
  key: string;
  description?: string;
  channel: NotificationChannel;
  severity: NotificationSeverity;
  digest_mode: NotificationDigestMode;
  subject: string;
  body: string;
  trigger_event: string;
}

export interface UpdateNotificationTemplateInput {
  name?: string;
  key?: string;
  description?: string;
  channel?: NotificationChannel;
  severity?: NotificationSeverity;
  digest_mode?: NotificationDigestMode;
  subject?: string;
  body?: string;
  trigger_event?: string;
}

export interface TestTemplateInput {
  user_name: string;
  user_email: string;
  company_name?: string;
  detail?: string;
}

export interface TestTemplateResult {
  rendered_subject: string;
  rendered_body: string;
  variables_used: Record<string, string>;
}

export interface UnreadCount {
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────────────────────

export type LocationType = 'region' | 'country' | 'city' | 'office';

export interface Location {
  _id: string;
  company_id: string;
  name: string;
  type: LocationType;
  parent_id?: string;
  timezone: string;
  is_headquarters: boolean;
  address?: string;
  working_hours?: {
    start: string;
    end: string;
    days: number[];
  };
  created_at: string;
  updated_at: string;
}
