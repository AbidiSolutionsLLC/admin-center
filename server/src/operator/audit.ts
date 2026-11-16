// server/src/operator/audit.ts
// Pure helpers for the operator audit trail (Plan 4.2, DRD 4.1/4.2): category from the action name, secret redaction,
// the list filter shared by GET /audit and GET /audit/export, and CSV encoding.
import { Types, ClientSession } from 'mongoose';
import { AUDIT_CATEGORIES, OperatorAuditEvent, type AuditCategory } from '../models/OperatorAuditEvent.model';
import { AuditEvent } from '../models/AuditEvent.model';
import { AppError } from '../utils/AppError';

export const EXPORT_ROW_CAP = 50_000;

const PREFIX_CATEGORY: Array<[string, AuditCategory]> = [
  ['org.', 'tenant'], ['identity_provider.', 'tenant'], ['plan.', 'plan'], ['entitlement.', 'entitlement'],
  ['onboarding.', 'onboarding'], ['operator.', 'operator'], ['product.', 'product'], ['security.', 'security'], ['audit.', 'security'],
];

/** Category of an action when the caller does not name one. Unknown prefixes are `system`. */
export function categoryOf(action: string): AuditCategory {
  return PREFIX_CATEGORY.find(([p]) => action.startsWith(p))?.[1] ?? 'system';
}

const SECRET_KEY = /(password|secret|token|hash)$/i;

/** Copy of `v` with the value of any secret-looking key replaced. Booleans stay (e.g. `password_changed: true`). */
export function redact<T>(v: T, depth = 0): T {
  if (v === null || typeof v !== 'object' || depth > 6) return v;
  if (v instanceof Types.ObjectId || v instanceof Date) return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1)) as T;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) =>
    [k, SECRET_KEY.test(k) && typeof val !== 'boolean' ? '[redacted]' : redact(val, depth + 1)])) as T;
}

const oid = (id: string, what: string) => {
  if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${what}`, 400, 'VALIDATION_ERROR');
  return new Types.ObjectId(id);
};
const date = (v: string, what: string) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new AppError(`Invalid ${what}`, 400, 'VALIDATION_ERROR');
  return d;
};
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** Mongo filter from the query string: action, company_id, operator_id, category, from, to. (`cursor` is the caller's.) */
export function buildAuditFilter(q: Record<string, unknown>): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (str(q.action)) f.action = q.action;
  if (str(q.company_id)) f.company_id = oid(String(q.company_id), 'company_id');
  if (str(q.operator_id)) f.operator_id = oid(String(q.operator_id), 'operator_id');
  if (str(q.category)) {
    if (!(AUDIT_CATEGORIES as readonly string[]).includes(String(q.category))) throw new AppError('Invalid category', 400, 'VALIDATION_ERROR');
    f.category = q.category;
  }
  const range: Record<string, Date> = {};
  if (str(q.from)) range.$gte = date(String(q.from), 'from');
  if (str(q.to)) range.$lte = date(String(q.to), 'to');
  if (Object.keys(range).length) f.created_at = range;
  return f;
}

export const CSV_COLUMNS = ['created_at', 'operator_email', 'operator_id', 'category', 'action', 'result', 'target_type', 'target_id', 'company_id', 'reason', 'correlation_id', 'before', 'after', 'details'] as const;

/** One CSV field: quoted, quotes doubled, and a leading = + - @ tab or CR neutralised so a spreadsheet will not run it. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const csvRow = (cells: unknown[]) => cells.map(csvField).join(',') + '\r\n';

/** `operator: null` = the system itself (a scheduled job). */
export interface AuditActor { operator: { _id: Types.ObjectId; email: string } | null; correlation_id?: string; ip?: string }
export interface AuditInput {
  action: string; target_type: string; target_id: string; company?: { _id: Types.ObjectId; name: string };
  details?: Record<string, unknown>; before?: unknown; after?: unknown;
  category?: AuditCategory; reason?: string; result?: 'success' | 'failure';
  /** false = keep out of the tenant's own audit log (internal notes). Default: mirrored when a company is given. */
  mirror?: boolean;
}

/**
 * Operator audit entry, plus the mirrored tenant AuditEvent (source 'operator') when a company is involved.
 * Direct model writes, not request-bound, so a background job can write as the operator that started it.
 */
export async function writeAudit(a: AuditActor, p: AuditInput, session?: ClientSession): Promise<void> {
  const opts = { session: session ?? undefined };
  await OperatorAuditEvent.create([{
    operator_id: a.operator?._id, operator_email: a.operator?.email ?? 'system', action: p.action, target_type: p.target_type, target_id: p.target_id,
    company_id: p.company?._id, details: redact(p.details), correlation_id: a.correlation_id,
    category: p.category ?? categoryOf(p.action), before: redact(p.before), after: redact(p.after), reason: p.reason, result: p.result ?? 'success',
  }], opts);
  if (p.company && p.mirror !== false) {
    await AuditEvent.create([{
      company_id: p.company._id, actor_id: null, actor_email: a.operator ? `operator:${a.operator.email}` : 'system', action: p.action, module: 'operator',
      category: 'Operator', object_type: p.target_type, object_id: p.target_id, object_label: p.company.name,
      before_state: (p.before as any) ?? null, after_state: (p.after as any) ?? p.details ?? null, ip_address: a.ip, source: 'operator',
      correlation_id: a.correlation_id,
    }], opts);
  }
}
