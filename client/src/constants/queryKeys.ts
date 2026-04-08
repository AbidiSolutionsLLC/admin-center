export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
  ORG_HEALTH: ['org', 'health'] as const,
  ORG_HISTORY: ['org', 'history'] as const,
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
  // Audit Logs
  AUDIT_EVENTS: (filters?: Record<string, unknown>) =>
    filters ? ['audit', 'events', filters] as const : ['audit', 'events'] as const,
} as const;
