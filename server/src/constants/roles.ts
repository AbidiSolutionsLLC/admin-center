// server/src/constants/roles.ts

/**
 * Centralized role constants to ensure consistency across the application.
 * Maps user-friendly role names to permission groups.
 */

export const ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  HR: 'HR',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  TECHNICIAN: 'Technician',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

/**
 * Permission groups for route protection
 */
export const PERMISSION_GROUPS = {
  // Full system access
  SUPER_ADMINS: [ROLES.SUPER_ADMIN],
  
  // People management: Super Admin, Admin, HR
  PEOPLE_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR],
  
  // Operations management: Super Admin, Admin
  OPS_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  
  // IT management: Super Admin, Admin
  IT_ADMINS: [ROLES.SUPER_ADMIN, ROLES.ADMIN],
  
  // All authenticated users
  ALL: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.TECHNICIAN],
} as const;

export type PermissionGroup = typeof PERMISSION_GROUPS[keyof typeof PERMISSION_GROUPS];
