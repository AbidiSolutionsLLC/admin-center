export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
  INSIGHTS: (filters?: Record<string, unknown>) =>
    filters ? ['insights', filters] as const : ['insights'] as const,
  // People
  USERS: ['users'] as const,
  USERS_FILTERED: (filters: Record<string, unknown>) => ['users', filters] as const,
  USER_DETAIL: (id: string) => ['user', id] as const,
  USER_STATS: ['users', 'stats'] as const,
} as const;
