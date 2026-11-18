// server/src/controllers/appAccess.controller.ts — Sprint 2 / E3 tenant endpoints (05 §3)
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { App } from '../models/App.model';
import { AppAssignment } from '../models/AppAssignment.model';
import { ProductRole, ProductKey } from '../models/ProductRole.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { User } from '../models/User.model';
import { Role } from '../models/Role.model';
import { Department } from '../models/Department.model';
import { Group } from '../models/Group.model';
import { Location } from '../models/Location.model';
import { Plan } from '../models/Plan.model';
import { Company } from '../models/Company.model';
import { SeatUsage } from '../models/SeatUsage.model';
import { computeEffectiveAccess, resolveAssignmentMemberIds } from '../lib/effectiveAccess';
import { runInTransaction, emitAppAccessChanged, correlationIdFor } from '../lib/platformEvents';
import { assertSeatsAvailable } from '../lib/seats';
import { launchUrlsFor } from '../lib/standalonePortals';

const oid = (v: string, what = 'id') => {
  if (!Types.ObjectId.isValid(v)) throw new AppError(`Invalid ${what}`, 400, 'INVALID_ID');
  return new Types.ObjectId(v);
};

/** GET /apps/:id/roles -> { success, data: [{ key, name, rank, is_default, assignable }] } */
export const getAppRoles = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const app = await App.findOne({ _id: oid(req.params.id as string), $or: [{ company_id: companyId }, { company_id: { $exists: false } }] }).lean();
  if (!app) throw new AppError('App not found', 404, 'APP_NOT_FOUND');
  const roles = app.product_key
    ? await ProductRole.find({ product_key: app.product_key }).sort({ rank: -1 }).lean()
    : [];
  res.status(200).json({
    success: true,
    data: roles.map(r => ({ key: r.key, name: r.name, rank: r.rank, is_default: r.is_default, assignable: r.assignable })),
  });
});

const patchAssignmentSchema = z.object({
  product_role_key: z.string().trim().min(1).optional(),
  include_descendants: z.boolean().optional(),
  reason: z.string().trim().optional(),
});

/** PATCH /apps/assignments/:id */
export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const body = patchAssignmentSchema.parse(req.body);
  const correlation_id = correlationIdFor(req);
  const assignment = await runInTransaction(async (session) => {
    const assignment = await AppAssignment.findOne({ _id: oid(req.params.id as string), company_id: companyId, is_active: true }).session(session ?? null);
    if (!assignment) throw new AppError('Active assignment not found', 404, 'ASSIGNMENT_NOT_FOUND');
    const app = await App.findById(assignment.app_id).session(session ?? null);
    if (!app) throw new AppError('App not found', 404, 'APP_NOT_FOUND');

    if (body.product_role_key !== undefined) {
      if (app.app_type !== 'karbexa_product') throw new AppError('App has no role catalog', 400, 'INVALID_ROLE');
      const role = await ProductRole.findOne({ product_key: app.product_key, key: body.product_role_key }).session(session ?? null).lean();
      if (!role || !role.assignable) throw new AppError('Invalid or non-assignable product role', 400, 'INVALID_ROLE');
      assignment.product_role_key = body.product_role_key;
    }
    if (body.include_descendants !== undefined) {
      // Widening to descendants can add members: Plan 4.7 seat limit check against the assignment as it would be.
      if (body.include_descendants && assignment.include_descendants === false && app.app_type === 'karbexa_product' && app.product_key) {
        const ent = await OrganizationEntitlement.findOne({ company_id: companyId, product_key: app.product_key, status: 'active' }).session(session ?? null).lean();
        await assertSeatsAvailable(companyId, app.product_key, ent?.seats_limit, { ...assignment.toObject(), include_descendants: true }, session);
      }
      assignment.include_descendants = body.include_descendants;
    }
    if (body.reason !== undefined) assignment.reason = body.reason;
    const before = await AppAssignment.findById(assignment._id).session(session ?? null).lean();
    await assignment.save({ session: session ?? undefined });

    await emitAppAccessChanged(session, companyId, await resolveAssignmentMemberIds(assignment, session), {
      actor: { type: 'member', id: String(req.user!.userId) }, correlation_id,
    });
    await auditLogger.logTx(session, {
      req, action: 'apps.assignment_updated', module: 'apps', object_type: 'AppAssignment',
      object_id: assignment._id.toString(), object_label: app.name,
      before_state: before as any, after_state: assignment.toObject(), correlation_id,
    });
    return assignment;
  });
  res.status(200).json({ success: true, data: assignment });
});

/**
 * GET /people/:id/effective-access
 * `computeEffectiveAccess` plus `reasons` (elevation 5.4, additive): per granted product, the matching assignments
 * that explain the role ("why does this person have this role?"). Looked up by `company_id`.
 */
export const getEffectiveAccess = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const memberId = oid(req.params.id as string);
  const member = await User.exists({ _id: memberId, company_id: companyId });
  if (!member) throw new AppError('Member not found', 404, 'USER_NOT_FOUND');
  const access = await computeEffectiveAccess(companyId, memberId);

  const assignmentIds = [...new Set(Object.values(access.products).flatMap((p) => p.granted_by))].filter((id) => Types.ObjectId.isValid(id));
  const assignments = assignmentIds.length
    ? await AppAssignment.find({ _id: { $in: assignmentIds }, company_id: companyId }).lean()
    : [];
  const idsOf = (type: string) => assignments.filter((a) => a.target_type === type && a.target_id).map((a) => a.target_id as Types.ObjectId);
  const names = new Map<string, string>();
  const load = async (model: any, ids: Types.ObjectId[], field: string) => {
    if (!ids.length) return;
    for (const r of await model.find({ _id: { $in: ids }, company_id: companyId }).select(field).lean()) names.set(String(r._id), r[field]);
  };
  await Promise.all([
    load(Role, idsOf('role'), 'name'), load(Department, idsOf('department'), 'name'), load(Group, idsOf('group'), 'name'),
    load(Location, idsOf('location'), 'name'), load(User, idsOf('user'), 'full_name'),
  ]);
  const byId = new Map(assignments.map((a) => [String(a._id), a]));
  const reasons: Record<string, Array<{ assignment_id: string; target_type: string; target_name: string; product_role_key: string | null; include_descendants: boolean | null }>> = {};
  for (const [pk, p] of Object.entries(access.products)) {
    reasons[pk] = p.granted_by.flatMap((id) => {
      const a = byId.get(id);
      if (!a) return [];
      const target_name = a.target_type === 'attribute'
        ? `${a.attribute_name} = ${a.attribute_value}`
        : names.get(String(a.target_id)) ?? `Unknown ${a.target_type}`;
      return [{
        assignment_id: id, target_type: a.target_type, target_name,
        product_role_key: a.product_role_key ?? null, include_descendants: a.include_descendants ?? null,
      }];
    });
  }
  res.status(200).json({ success: true, data: { ...access, reasons } });
});

/**
 * GET /organization/subscription -> { success, data: { entitlements: [...], products: [...] } }
 * `products` (elevation 5.4, additive) has one row per registry product: entitlement state, seats (limit and the last
 * `SeatUsage` count, never computed here), default role, and for a locked product the plans that include it.
 * Elevation 5.5 adds `plan` (the plan most of the plan-sourced entitlements came from) and `trial_ends_at`; each
 * entitlement gains `expires_at` (overrides).
 */
export const getSubscription = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const rows = await OrganizationEntitlement.find({ company_id: companyId }).sort({ product_key: 1 }).lean();
  const apps = await App.find({ app_type: 'karbexa_product', company_id: { $exists: false } }).select('name description product_key default_role_key is_active').sort({ product_key: 1 }).lean();
  const keys = apps.map((a) => a.product_key as string).filter(Boolean);
  const [usage, roles, plans] = await Promise.all([
    SeatUsage.find({ company_id: companyId, product_key: { $in: keys } }).lean(),
    ProductRole.find({ product_key: { $in: keys } }).select('product_key key name').lean(),
    Plan.find({ status: 'active', products: { $in: keys } }).select('key name products').sort({ key: 1 }).lean(),
  ]);
  const usedBy = new Map(usage.map((u) => [u.product_key, u.used]));
  const planCounts = new Map<string, number>();
  for (const e of rows) if (e.source === 'plan' && e.plan_key) planCounts.set(e.plan_key, (planCounts.get(e.plan_key) ?? 0) + 1);
  const planKey = [...planCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const [planDoc, company] = await Promise.all([
    planKey ? Plan.findOne({ key: planKey }).select('key name').lean() : null,
    Company.findOne({ _id: companyId }).select('trial_ends_at').lean(),
  ]);
  const ent = new Map(rows.map((e) => [e.product_key as string, e]));
  const products = apps.filter((a) => a.product_key).map((a) => {
    const pk = a.product_key as string;
    const e = ent.get(pk);
    const entitled = e?.status === 'active';
    const defaultRole = a.default_role_key ? roles.find((r) => r.product_key === pk && r.key === a.default_role_key) : undefined;
    return {
      product_key: pk, name: a.name, description: a.description ?? null, app_id: a._id,
      entitled, status: e?.status ?? null, seats_limit: e?.seats_limit ?? null, seats_used: entitled ? usedBy.get(pk) ?? 0 : 0,
      default_role: defaultRole ? { key: defaultRole.key, name: defaultRole.name } : null,
      included_in_plans: entitled ? [] : plans.filter((p) => (p.products as string[]).includes(pk)).map((p) => ({ key: p.key, name: p.name })),
    };
  });
  res.status(200).json({
    success: true,
    data: {
      entitlements: rows.map(e => ({
        product_key: e.product_key, status: e.status, seats_limit: e.seats_limit ?? null,
        source: e.source, plan_key: e.plan_key ?? null, expires_at: e.expires_at ?? null,
      })),
      products,
      plan: planDoc ? { key: planDoc.key, name: planDoc.name } : planKey ? { key: planKey, name: planKey } : null,
      trial_ends_at: company?.trial_ends_at ?? null,
    },
  });
});

/** GET /me/apps -> { success, data: [{ id, name, product_key, launch_url, icon_url, description, role, role_name }] } */
export const getMyApps = asyncHandler(async (req: Request, res: Response) => {
  const access = await computeEffectiveAccess(req.user!.company_id, req.user!.userId);
  const keys = Object.keys(access.products) as ProductKey[];
  const apps = keys.length
    ? await App.find({ app_type: 'karbexa_product', product_key: { $in: keys }, is_active: true, company_id: { $exists: false } }).lean()
    : [];
  // Standalone portals: the organisation's own launch URL first (WS-C C-6); suite products keep a.launch_url.
  const urls = await launchUrlsFor(req.user!.company_id, apps.map(a => a.product_key!).filter(Boolean));
  res.status(200).json({
    success: true,
    data: apps.map(a => ({
      id: a._id, name: a.name, slug: a.slug, product_key: a.product_key, launch_url: urls[a.product_key!] ?? a.launch_url,
      icon_url: a.icon_url, description: a.description,
      role: access.products[a.product_key!].role, role_name: access.products[a.product_key!].role_name,
    })),
  });
});
