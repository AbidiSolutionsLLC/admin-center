export const QUERY_KEYS = {
  DEPARTMENTS: ['departments'] as const,
  DEPARTMENT_DETAIL: (id: string) => ['department', id] as const,
  ORG_TREE: ['org', 'tree'] as const,
} as const;
