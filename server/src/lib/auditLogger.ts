import { Request } from 'express';
import { Types, ClientSession } from 'mongoose';
import { AuditEvent } from '../models/AuditEvent.model';
import { sendSecurityAlert } from './notificationEngine';
import { correlationIdFor, onCommit } from './platformEvents';

interface LogParams {
  req?: Request;
  action: string;
  module: string;
  category?: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state?: unknown | null;
  after_state?: unknown | null;
  source?: string;
  correlation_id?: string;
  session?: ClientSession;
  actor_override?: {
    userId: string;
    email: string;
    company_id: any;
  };
}

const ADMIN_CHANGE_ACTIONS = ['roles.permissions_updated', 'roles.updated', 'roles.deleted', 'security.force_logout'];

/** Admin-change security alert for sensitive actions (role/permission edits, force logout, user role change). */
function fireAdminChangeAlert(params: LogParams, company_id: any): void {
  let isAdminChange = ADMIN_CHANGE_ACTIONS.includes(params.action);
  let alertDetail = `Admin action '${params.action}' was performed on ${params.object_type} "${params.object_label}".`;
  if (params.action === 'user.updated' && params.before_state && params.after_state) {
    const before = params.before_state as any;
    const after = params.after_state as any;
    if (before.role && after.role && before.role !== after.role) {
      isAdminChange = true;
      alertDetail = `User "${params.object_label}" role changed from '${before.role}' to '${after.role}'.`;
    }
  }
  if (isAdminChange) {
    sendSecurityAlert(company_id.toString(), 'admin_change', alertDetail)
      .catch(err => console.error('[AuditLog] Failed to send admin change alert:', err));
  }
}

export const auditLogger = {
  log: async (params: LogParams): Promise<void> => {
    try {
      const company_id = params.actor_override?.company_id || params.req?.user?.company_id;
      const actor_id = params.actor_override?.userId || params.req?.user?.userId;
      const actor_email = params.actor_override?.email || params.req?.user?.email;

      if (!company_id) {
        console.warn(`[AuditLog] Missing company_id for action: ${params.action} — Multi-tenant isolation prevented un-scoped audit log.`);
        return;
      }

      const validActorId = actor_id && Types.ObjectId.isValid(actor_id) ? new Types.ObjectId(actor_id) : undefined;
      const validCompanyId = Types.ObjectId.isValid(company_id) ? new Types.ObjectId(company_id) : company_id;

      await AuditEvent.create({
        company_id: validCompanyId,
        actor_id: validActorId,
        actor_email: actor_email || 'system@admin-center.com',
        action: params.action,
        module: params.module,
        category: params.category || 'System',
        object_type: params.object_type,
        object_id: params.object_id,
        object_label: params.object_label,
        before_state: params.before_state as any,
        after_state: params.after_state as any,
        ip_address: params.req?.ip,
        user_agent: params.req?.headers ? params.req.headers['user-agent'] : undefined,
        source: params.source ?? 'admin',
        correlation_id: params.correlation_id ?? (params.req ? correlationIdFor(params.req) : undefined),
      });

      fireAdminChangeAlert(params, company_id);

      // Trigger intelligence rules on every admin write operation to ensure near real-time updates
      const { triggerIntelligenceRules } = await import('./intelligence');
      triggerIntelligenceRules(company_id);

    } catch (error) {
      console.error('Audit Log failed to write:', error);
      // We don't throw here to avoid failing the user action if audit logging fails
    }
  },
  /** Transactional write: same session as the business change, throws on failure. Alerts/intelligence run via onCommit. */
  logTx: async (session: ClientSession | undefined, params: LogParams): Promise<void> => {
    const company_id = params.actor_override?.company_id || params.req?.user?.company_id;
    if (!company_id) throw new Error(`[AuditLog] Missing company_id for action: ${params.action}`);
    const actor_id = params.actor_override?.userId || params.req?.user?.userId;
    await AuditEvent.create([{
      company_id: Types.ObjectId.isValid(company_id) ? new Types.ObjectId(company_id) : company_id,
      actor_id: actor_id && Types.ObjectId.isValid(actor_id) ? new Types.ObjectId(actor_id) : undefined,
      actor_email: params.actor_override?.email || params.req?.user?.email || 'system@admin-center.com',
      action: params.action,
      module: params.module,
      category: params.category || 'System',
      object_type: params.object_type,
      object_id: params.object_id,
      object_label: params.object_label,
      before_state: params.before_state as any,
      after_state: params.after_state as any,
      ip_address: params.req?.ip,
      user_agent: params.req?.headers ? params.req.headers['user-agent'] : undefined,
      source: params.source ?? 'admin',
      correlation_id: params.correlation_id ?? (params.req ? correlationIdFor(params.req) : undefined),
    }], { session });
    // Post-commit side effects (the audit row and the business change are atomic; these must not fire on abort)
    onCommit(session, () => fireAdminChangeAlert(params, company_id));
    onCommit(session, async () => {
      const { triggerIntelligenceRules } = await import('./intelligence');
      triggerIntelligenceRules(company_id);
    });
  },
};
