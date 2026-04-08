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
}

export const auditLogger = {
  log: async (params: LogParams): Promise<void> => {
    try {
      await AuditEvent.create({
        company_id: params.req.user.company_id,
        actor_id: params.req.user.userId,
        actor_email: params.req.user.email,
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
