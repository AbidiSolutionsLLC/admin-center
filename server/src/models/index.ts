// server/src/models/index.ts
/**
 * Central Models Registry
 * Imports and exports all Mongoose models to ensure they are registered
 * with Mongoose as soon as the package is imported.
 */

export * from './Company.model';
export * from './User.model';
export * from './Department.model';
export * from './Team.model';
export * from './TeamMember.model';
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
export * from './SecurityEvent.model';
export * from './SecurityPolicy.model';
export * from './PolicyVersion.model';
export * from './PolicyAcknowledgment.model';
export * from './InviteToken.model';
export * from './CustomField.model';
export * from './Integration.model';
export * from './IntegrationSyncLog.model';

// Notification models
export * from './NotificationTemplate.model';
export * from './NotificationEvent.model';
export * from './InAppNotification.model';

// Workflow models
export * from './Workflow.model';
export * from './WorkflowStep.model';
export * from './WorkflowRun.model';

// Policy models
export * from './PolicyAssignment.model';
