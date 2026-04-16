export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
  ORG_HEALTH: ['org', 'health'] as const,
  ORG_HISTORY: (params?: Record<string, unknown>) => ['org', 'history', params] as const,
  BUSINESS_UNITS: ['business-units'] as const,
  BU_TREE: ['bu-tree'] as const,
  INSIGHTS: (filters?: Record<string, unknown>) =>
    filters ? ['insights', filters] as const : ['insights'] as const,
  // Teams
  TEAMS: ['teams'] as const,
  TEAM_DETAIL: (id: string) => ['team', id] as const,
  TEAM_MEMBERS: (id: string) => ['team', id, 'members'] as const,
  // People
  USERS: ['users'] as const,
  USERS_FILTERED: (filters: Record<string, unknown>) => ['users', filters] as const,
  USER_DETAIL: (id: string) => ['user', id] as const,
  USER_STATS: ['users', 'stats'] as const,
  USER_REPORTING_LINE: (userId: string) => ['user', userId, 'reporting-line'] as const,
  // Roles
  ROLES: ['roles'] as const,
  ROLE_DETAIL: (id: string) => ['role', id] as const,
  ROLE_PERMISSIONS: (id: string) => ['role', 'permissions', id] as const,
  ROLE_USERS: (id: string) => ['role', 'users', id] as const,
  ALL_PERMISSIONS: ['permissions', 'all'] as const,
  // Apps
  APPS: ['apps'] as const,
  APP_DETAIL: (id: string) => ['app', id] as const,
  APP_ASSIGNMENTS: (id: string) => ['app', 'assignments', id] as const,
  APP_TIMELINE: (id: string) => ['app', 'timeline', id] as const,
  APP_DEPENDENCIES: (id: string, targetType: string, targetId: string) => ['app', 'dependencies', id, targetType, targetId] as const,
  APP_USERS: (id: string) => ['app', 'users', id] as const,
  // Overview
  DASHBOARD_STATS: ['overview', 'stats'] as const,
  SETUP_PROGRESS: ['overview', 'setup-progress'] as const,
  RECENT_ACTIVITY: ['overview', 'recent-activity'] as const,
  OVERVIEW_INSIGHTS: ['overview', 'insights'] as const,
  // Security
  SECURITY_POLICY: ['security', 'policy'] as const,
  SECURITY_EVENTS: (filters?: Record<string, unknown>) =>
    filters ? ['security', 'events', filters] as const : ['security', 'events'] as const,
  COMPANY_EMPLOYEE_ID_FORMAT: ['company', 'employee-id-format'] as const,
  // Audit Logs
  AUDIT_EVENTS: (filters?: Record<string, unknown>) =>
    filters ? ['audit', 'events', filters] as const : ['audit', 'events'] as const,
  // Policies
  POLICIES: ['policies'] as const,
  POLICY_VERSIONS: (policyKey: string) => ['policy', 'versions', policyKey] as const,
  POLICY_DETAIL: (id: string) => ['policy', id] as const,
  POLICY_ACKNOWLEDGMENTS: (id: string) => ['policy', id, 'acknowledgments'] as const,
  POLICY_ACKNOWLEDGMENT_STATUS: (id: string) => ['policy', id, 'acknowledgment-status'] as const,
  POLICY_ASSIGNMENTS: (id: string) => ['policy', id, 'assignments'] as const,
  POLICY_CONFLICTS: (id: string) => ['policy', id, 'conflicts'] as const,
  POLICY_VERSION_DIFF: (policyKey: string, versionA: string, versionB: string) =>
    ['policy', 'diff', policyKey, versionA, versionB] as const,
  // Workflows
  WORKFLOWS: ['workflows'] as const,
  WORKFLOW_DETAIL: (id: string) => ['workflow', id] as const,
  WORKFLOW_RUNS: (id: string) => ['workflow', id, 'runs'] as const,
  // Locations
  LOCATIONS: ['locations'] as const,
  LOCATION_TREE: ['locations', 'tree'] as const,
  LOCATION_DETAIL: (id: string) => ['location', id] as const,
  // Custom Fields
  CUSTOM_FIELDS: (targetObject?: string) =>
    targetObject ? ['custom-fields', targetObject] as const : ['custom-fields'] as const,
  CUSTOM_FIELD_DETAIL: (id: string) => ['custom-field', id] as const,
  // Integrations
  INTEGRATIONS: ['integrations'] as const,
  INTEGRATION_DETAIL: (id: string) => ['integration', id] as const,
  INTEGRATION_SYNC_LOGS: (id: string) => ['integration', id, 'sync-logs'] as const,
  // Notifications
  NOTIFICATION_TEMPLATES: ['notification', 'templates'] as const,
  NOTIFICATION_TEMPLATE_DETAIL: (id: string) => ['notification', 'template', id] as const,
  NOTIFICATION_EVENTS: ['notification', 'events'] as const,
  IN_APP_NOTIFICATIONS: ['notification', 'in-app'] as const,
  UNREAD_NOTIFICATION_COUNT: ['notification', 'unread-count'] as const,
} as const;
