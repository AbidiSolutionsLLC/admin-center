import { Request } from 'express';
import { AuditEvent } from '../models/AuditEvent.model';

interface LogParams {
  req: Request;
  action: string;
  module: string;
  object_type: string;
  object_id: string;
  object_label: string;
  before_state?: unknown | null;
  after_state?: unknown | null;
  actor_override?: {
    userId: string;
    email: string;
    company_id: any;
  };
}

export const auditLogger = {
  log: async (params: LogParams): Promise<void> => {
    try {
      const company_id = params.actor_override?.company_id || params.req.user?.company_id;
      const actor_id = params.actor_override?.userId || params.req.user?.userId;
      const actor_email = params.actor_override?.email || params.req.user?.email;

      if (!company_id) {
        console.warn(`[AuditLog] Missing company_id for action: ${params.action}`);
        return;
      }

      await AuditEvent.create({
        company_id,
        actor_id: actor_id || 'system',
        actor_email: actor_email || 'system@admin-center.com',
        action: params.action,
        module: params.module,
        object_type: params.object_type,
        object_id: params.object_id,
        object_label: params.object_label,
        before_state: params.before_state as any,
        after_state: params.after_state as any,
        ip_address: params.req.ip,
        user_agent: params.req.headers['user-agent'],
      });
    } catch (error) {
      console.error('Audit Log failed to write:', error);
      // We don't throw here to avoid failing the user action if audit logging fails
    }
  },
};
