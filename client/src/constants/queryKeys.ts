export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
  INSIGHTS: (filters?: Record<string, unknown>) => 
    filters ? ['insights', filters] as const : ['insights'] as const,
} as const;
