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
import { computeEffectiveAccess, resolveAssignmentMemberIds } from '../lib/effectiveAccess';
import { runInTransaction, emitAppAccessChanged, correlationIdFor } from '../lib/platformEvents';
import { assertSeatsAvailable } from '../lib/seats';

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

/** GET /people/:id/effective-access */
export const getEffectiveAccess = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const memberId = oid(req.params.id as string);
  const member = await User.exists({ _id: memberId, company_id: companyId });
  if (!member) throw new AppError('Member not found', 404, 'USER_NOT_FOUND');
  const access = await computeEffectiveAccess(companyId, memberId);
  res.status(200).json({ success: true, data: access });
});

/** GET /organization/subscription -> { success, data: { entitlements: [...] } } */
export const getSubscription = asyncHandler(async (req: Request, res: Response) => {
  const rows = await OrganizationEntitlement.find({ company_id: req.user!.company_id }).sort({ product_key: 1 }).lean();
  res.status(200).json({
    success: true,
    data: {
      entitlements: rows.map(e => ({
        product_key: e.product_key, status: e.status, seats_limit: e.seats_limit ?? null,
        source: e.source, plan_key: e.plan_key ?? null,
      })),
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
  res.status(200).json({
    success: true,
    data: apps.map(a => ({
      id: a._id, name: a.name, slug: a.slug, product_key: a.product_key, launch_url: a.launch_url,
      icon_url: a.icon_url, description: a.description,
      role: access.products[a.product_key!].role, role_name: access.products[a.product_key!].role_name,
    })),
  });
});
