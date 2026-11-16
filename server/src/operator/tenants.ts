// server/src/operator/tenants.ts
// Tenant profile endpoints (Plan 4.4, DRD 4.2): products, admins, internal notes. Mounted on the operator router, so
// every route is behind requireOperator. `routes.ts` passes in its own helpers (as onboarding.ts does).
//   GET    /orgs/:id/products
//   GET    /orgs/:id/admins
//   GET    /orgs/:id/notes        POST /orgs/:id/notes        DELETE /orgs/:id/notes/:noteId
import { Router, Request, Response } from 'express';
import { Types, ClientSession } from 'mongoose';
import { z } from 'zod';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { Identity } from '../models/Identity.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { TenantNote } from '../models/TenantNote.model';
import { ROLES } from '../constants/roles';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { listProducts } from '../lib/productRegistry';
import { permissionsFor, requirePermission } from './permissions';

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  oid: (id: string, what?: string) => string;
  audit: (req: Request, p: {
    action: string; target_type: string; target_id: string; company?: { _id: Types.ObjectId; name: string };
    details?: Record<string, unknown>; before?: unknown; after?: unknown; mirror?: boolean;
  }, session?: ClientSession) => Promise<void>;
}

/** Roles that make a member an organisation administrator. */
export const ADMIN_ROLE_NAMES: readonly string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR_ADMIN, ROLES.IT_ADMIN, ROLES.OPS_ADMIN];

const NoteSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export function tenantRoutes(h: Helpers): Router {
  const router = Router();

  const loadCompany = async (req: Request) => {
    const company = await Company.findById(h.oid(String(req.params.id)));
    if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
    return company;
  };

  // Every registered product with the organisation's entitlement for it (a product with none reads `not_entitled`).
  router.get('/orgs/:id/products', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
    const company = await loadCompany(req);
    const [products, ents] = await Promise.all([
      listProducts(),
      OrganizationEntitlement.find({ company_id: company._id }),
    ]);
    const byKey = new Map(ents.map((e) => [e.product_key, e]));
    h.ok(res, products.map((p) => {
      const e = byKey.get(p.product_key);
      return {
        product_key: p.product_key,
        name: p.name,
        status: e?.status ?? 'not_entitled',
        source: e?.source ?? null,
        plan_key: e?.plan_key ?? null,
        seats_limit: e?.seats_limit ?? null,
      };
    }));
  }));

  // Organisation administrators: members holding an admin role, with MFA and last sign-in.
  router.get('/orgs/:id/admins', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
    const company = await loadCompany(req);
    const roles = await Role.find({ company_id: company._id, name: { $in: ADMIN_ROLE_NAMES } }).select('_id name').lean();
    const links = await UserRole.find({ company_id: company._id, role_id: { $in: roles.map((r) => r._id) } }).select('user_id role_id').lean();
    const roleName = new Map(roles.map((r) => [String(r._id), r.name as string]));
    const rolesOf = new Map<string, string[]>();
    for (const l of links) rolesOf.set(String(l.user_id), [...(rolesOf.get(String(l.user_id)) ?? []), roleName.get(String(l.role_id))!]);
    const users = await User.find({ _id: { $in: [...rolesOf.keys()] }, company_id: company._id }).sort({ full_name: 1 }).lean();
    const identityIds = users.map((u) => u.identity_id).filter((i): i is Types.ObjectId => !!i);
    const identities = await Identity.find({ _id: { $in: identityIds } }).select('mfa').lean();
    const mfa = new Map(identities.map((i) => [String(i._id), !!(i.mfa?.totp_enabled || i.mfa?.email_otp_enabled)]));
    h.ok(res, users.map((u) => ({
      id: String(u._id),
      full_name: u.full_name,
      email: u.email,
      roles: rolesOf.get(String(u._id)) ?? [],
      mfa_enabled: u.identity_id ? (mfa.get(String(u.identity_id)) ?? false) : false,
      last_login_at: u.last_login ?? null,
      status: u.lifecycle_state,
    })));
  }));

  const noteOut = (n: any) => ({ id: String(n._id), operator_id: String(n.operator_id), operator_email: n.operator_email, body: n.body, created_at: n.created_at });

  router.get('/orgs/:id/notes', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
    const company = await loadCompany(req);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 100);
    const filter: Record<string, unknown> = { company_id: company._id };
    if (typeof req.query.cursor === 'string' && req.query.cursor) filter._id = { $lt: h.oid(req.query.cursor, 'cursor') };
    const rows = await TenantNote.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const page = rows.slice(0, limit);
    h.ok(res, page.map(noteOut), 200, { limit, next_cursor: rows.length > limit ? String(page[page.length - 1]._id) : null });
  }));

  // Notes are internal to the Command Center: audited, but not mirrored into the tenant's own audit log.
  router.post('/orgs/:id/notes', requirePermission('notes.write'), asyncHandler(async (req: Request, res: Response) => {
    const { body } = NoteSchema.parse(req.body);
    const company = await loadCompany(req);
    const note = await TenantNote.create({ company_id: company._id, operator_id: req.operator!._id, operator_email: req.operator!.email, body });
    await h.audit(req, { action: 'org.note_added', target_type: 'TenantNote', target_id: String(note._id), company, mirror: false, details: { length: body.length } });
    h.ok(res, noteOut(note), 201);
  }));

  // The author may delete their own note; deleting someone else's needs tenants.write (platform admin, operations).
  router.delete('/orgs/:id/notes/:noteId', requirePermission('notes.write'), asyncHandler(async (req: Request, res: Response) => {
    const company = await loadCompany(req);
    const note = await TenantNote.findOne({ _id: h.oid(String(req.params.noteId), 'note id'), company_id: company._id });
    if (!note) throw new AppError('Note not found', 404, 'NOT_FOUND');
    const own = note.operator_id.equals(req.operator!._id);
    if (!own && !permissionsFor(req.operator!.roles).includes('tenants.write')) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    await note.deleteOne();
    await h.audit(req, {
      action: 'org.note_deleted', target_type: 'TenantNote', target_id: String(note._id), company, mirror: false,
      details: { author: note.operator_email, own },
    });
    h.ok(res, { id: String(note._id), deleted: true });
  }));

  return router;
}
