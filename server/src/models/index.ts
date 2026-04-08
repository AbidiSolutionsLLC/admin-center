// server/src/models/index.ts
/**
 * Central Models Registry
 * Imports and exports all Mongoose models to ensure they are registered
 * with Mongoose as soon as the package is imported.
 */

export * from './Company.model';
export * from './User.model';
export * from './Department.model';
export * from './Location.model';
export * from './AuditEvent.model';
export * from './Permission.model';
export * from './Role.model';
export * from './RolePermission.model';
export * from './UserRole.model';
export * from './App.model';
export * from './AppAssignment.model';
export * from './RefreshToken.model';
export * from './Insight.model';
