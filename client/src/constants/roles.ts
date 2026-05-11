// client/src/constants/roles.ts

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  HR_ADMIN: 'HR Admin',
  IT_ADMIN: 'IT Admin',
  OPS_ADMIN: 'Ops Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  TECHNICIAN: 'Technician',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

export const PERMISSION_GROUPS = {
  SUPER_ADMINS: [ROLES.SUPER_ADMIN],
  ROLE_ADMINS: [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.OPS_ADMIN],
  PEOPLE_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HR_ADMIN],
  OPS_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.OPS_ADMIN],
  IT_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.IT_ADMIN],
  ALL: Object.values(ROLES),
} as const;
