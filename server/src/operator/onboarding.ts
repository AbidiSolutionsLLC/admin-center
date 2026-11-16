// server/src/operator/onboarding.ts
// Operator onboarding API (Plan 2.6, DRD §4.2): what happened to an organisation's first-admin invitation, and the two
// things an operator can do about it. Mounted on the operator router, so every route is behind requireOperator.
//   GET   /orgs/:id/onboarding
//   POST  /orgs/:id/onboarding/resend-invite
//   PATCH /orgs/:id/onboarding/first-admin
//   GET   /onboarding
// `routes.ts` passes in its own helpers (audit, envelope, id check) so that this file does not import routes.ts.
import { Router, Request, Response } from 'express';
import { Types, ClientSession } from 'mongoose';
import { z } from 'zod';
import { Company, ICompany } from '../models/Company.model';
import { User, IUser } from '../models/User.model';
import { Role } from '../models/Role.model';
import { UserRole } from '../models/UserRole.model';
import { Invitation, IInvitation } from '../models/Invitation.model';
import { EmailDelivery } from '../models/EmailDelivery.model';
import { ROLES } from '../constants/roles';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { createInvitation, inviteLink } from '../lib/invitations';
import { sendWelcomeEmail } from '../lib/emailService';
import { runInTransaction, emitPlatformEvent } from '../lib/platformEvents';
import { requirePermission } from './permissions';

/**
 * The organisation's first admin: the earliest holder of the Super Admin role (through `UserRole`), replacing the
 * legacy `User.role` lookup. Tenant-scoped by `company_id`.
 */
export async function findFirstAdmin(companyId: Types.ObjectId, session?: ClientSession | null): Promise<IUser | null> {
  const role = await Role.findOne({ company_id: companyId, name: ROLES.SUPER_ADMIN }).select('_id').session(session ?? null);
  if (!role) return null;
  const link = await UserRole.findOne({ company_id: companyId, role_id: role._id }).sort({ assigned_at: 1, _id: 1 }).select('user_id').session(session ?? null);
  if (!link) return null;
  return User.findOne({ _id: link.user_id, company_id: companyId }).session(session ?? null);
}

export type OnboardingStage =
  | 'complete'
  | 'no_first_admin'
  | 'no_invitation'
  | 'sending'
  | 'delivery_failed'
  | 'awaiting_acceptance'
  | 'expired'
  | 'revoked';

type DeliveryRow = { status: string; attempts: number; last_error?: string; sent_at?: Date; created_at: Date };

/** Where the first admin is in the invitation flow. Pure, so it can be tested without a database. */
export function onboardingStage(
  admin: Pick<IUser, 'lifecycle_state'> | null,
  inv: Pick<IInvitation, 'state' | 'expires_at'> | null,
  delivery: Pick<DeliveryRow, 'status'> | null,
  now: Date = new Date(),
): OnboardingStage {
  if (!admin) return 'no_first_admin';
  if (admin.lifecycle_state !== 'invited' || inv?.state === 'accepted') return 'complete';
  if (!inv) return 'no_invitation';
  if (inv.state === 'revoked') return 'revoked';
  if (inv.state === 'pending' && inv.expires_at.getTime() <= now.getTime()) return 'expired';
  if (inv.state !== 'pending') return 'no_invitation'; // superseded with nothing newer pending: needs a fresh invitation
  if (delivery?.status === 'failed') return 'delivery_failed';
  if (delivery && (delivery.status === 'queued' || delivery.status === 'sending')) return 'sending';
  return 'awaiting_acceptance';
}

/** One organisation's onboarding picture. Never contains a token. */
export async function describeOnboarding(company: ICompany, now: Date = new Date()) {
  const admin = await findFirstAdmin(company._id as Types.ObjectId);
  const inv = admin
    ? await Invitation.findOne({ company_id: company._id, user_id: admin._id, kind: 'first_admin' }).sort({ createdAt: -1 })
    : null;
  const delivery: DeliveryRow | null = admin && inv
    ? await EmailDelivery.findOne({
      company_id: company._id, 'related.type': 'user', 'related.id': String(admin._id), created_at: { $gte: inv.createdAt },
    }).sort({ created_at: -1 }).select('status attempts last_error sent_at created_at').lean<DeliveryRow>()
    : null;

  return {
    organization: { id: String(company._id), slug: company.slug, name: company.name, status: company.status },
    stage: onboardingStage(admin, inv, delivery, now),
    first_admin: admin ? { user_id: String(admin._id), email: admin.email, full_name: admin.full_name, lifecycle_state: admin.lifecycle_state } : null,
    invitation: inv
      ? {
        state: inv.state === 'pending' && inv.expires_at.getTime() <= now.getTime() ? 'expired' : inv.state,
        sent_at: inv.last_sent_at ?? null,
        sent_count: inv.sent_count,
        expires_at: inv.expires_at,
        accepted_at: inv.accepted_at ?? null,
        revoked_at: inv.revoked_at ?? null,
      }
      : null,
    delivery: delivery
      ? { status: delivery.status, attempts: delivery.attempts, last_error: delivery.last_error ?? null, sent_at: delivery.sent_at ?? null, queued_at: delivery.created_at }
      : null,
  };
}

interface Helpers {
  ok: (res: Response, data: unknown, status?: number, meta?: unknown) => unknown;
  oid: (id: string, what?: string) => string;
  audit: (req: Request, p: {
    action: string; target_type: string; target_id: string; company?: { _id: Types.ObjectId; name: string };
    details?: Record<string, unknown>; before?: unknown; after?: unknown;
  }, session?: ClientSession) => Promise<void>;
  actorOf: (req: Request) => { type: 'operator'; id: string };
  corrOf: (req: Request) => string;
}

const FirstAdminSchema = z.object({
  email: z.string().trim().email().toLowerCase(),
  full_name: z.string().trim().min(1).max(120),
});

export function onboardingRoutes(h: Helpers): Router {
  const router = Router();

  const loadCompany = async (req: Request): Promise<ICompany> => {
    const company = await Company.findById(h.oid(String(req.params.id)));
    if (!company) throw new AppError('Organization not found', 404, 'NOT_FOUND');
    return company;
  };

  router.get('/orgs/:id/onboarding', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
    h.ok(res, await describeOnboarding(await loadCompany(req)));
  }));

  router.post('/orgs/:id/onboarding/resend-invite', requirePermission('onboarding.write'), asyncHandler(async (req: Request, res: Response) => {
    const company = await loadCompany(req);
    if (company.status === 'closed') throw new AppError('Closed organizations cannot be changed', 409, 'ORG_CLOSED');
    const admin = await findFirstAdmin(company._id as Types.ObjectId);
    if (!admin) throw new AppError('This organization has no first admin', 409, 'NO_FIRST_ADMIN');
    if (admin.lifecycle_state !== 'invited') throw new AppError('The first admin has already accepted', 409, 'ALREADY_ONBOARDED');

    // Supersede the current invitation, issue a new one and queue the e-mail, all in one transaction.
    const deliveryId = await runInTransaction(async (session) => {
      const { rawToken } = await createInvitation(session, {
        kind: 'first_admin', company_id: company._id as Types.ObjectId, user_id: admin._id, email: admin.email,
        created_by: { type: 'operator', id: req.operator!._id },
      });
      const id = await sendWelcomeEmail({
        email: admin.email, full_name: admin.full_name, employee_id: admin.employee_id, company_name: company.name,
        invite_link: inviteLink(rawToken, admin.email),
        meta: { company_id: company._id as Types.ObjectId, related: { type: 'user', id: String(admin._id) }, session },
      });
      await h.audit(req, {
        action: 'onboarding.invite_resent', target_type: 'Company', target_id: String(company._id), company,
        details: { first_admin_email: admin.email },
      }, session ?? undefined);
      return id;
    });
    h.ok(res, { invite_delivery_id: deliveryId ?? null });
  }));

  router.patch('/orgs/:id/onboarding/first-admin', requirePermission('tenants.write'), asyncHandler(async (req: Request, res: Response) => {
    const input = FirstAdminSchema.parse(req.body);
    const company = await loadCompany(req);
    if (company.status === 'closed') throw new AppError('Closed organizations cannot be changed', 409, 'ORG_CLOSED');
    const admin = await findFirstAdmin(company._id as Types.ObjectId);
    if (!admin) throw new AppError('This organization has no first admin', 409, 'NO_FIRST_ADMIN');
    if (admin.lifecycle_state !== 'invited') throw new AppError('The first admin has already accepted; the address can no longer be changed here', 409, 'ALREADY_ONBOARDED');

    const changed: Record<string, string> = {};
    if (input.email !== admin.email.toLowerCase()) changed.email = input.email;
    if (input.full_name !== admin.full_name) changed.full_name = input.full_name;
    if (Object.keys(changed).length === 0) {
      h.ok(res, { changed: false, invite_delivery_id: null });
      return;
    }
    if (changed.email && await User.exists({ company_id: company._id, email: changed.email, _id: { $ne: admin._id } })) {
      throw new AppError('Another member of this organization already uses that e-mail address', 409, 'EMAIL_IN_USE');
    }

    // The invitation follows the new address: the old link is superseded and a new e-mail is queued.
    const deliveryId = await runInTransaction(async (session) => {
      const fresh = await User.findOne({ _id: admin._id, company_id: company._id }).session(session ?? null);
      if (!fresh || fresh.lifecycle_state !== 'invited') throw new AppError('The first admin has already accepted', 409, 'ALREADY_ONBOARDED');
      const before = { email: fresh.email, full_name: fresh.full_name };
      if (changed.email) fresh.email = changed.email;
      if (changed.full_name) fresh.full_name = changed.full_name;
      await fresh.save({ session: session ?? undefined });

      await emitPlatformEvent(session, {
        org_id: String(company._id), type: 'member.updated', subject: { type: 'member', id: String(fresh._id) },
        actor: h.actorOf(req), correlation_id: h.corrOf(req), data: { changed },
      });

      const { rawToken } = await createInvitation(session, {
        kind: 'first_admin', company_id: company._id as Types.ObjectId, user_id: fresh._id, email: fresh.email,
        created_by: { type: 'operator', id: req.operator!._id },
      });
      const id = await sendWelcomeEmail({
        email: fresh.email, full_name: fresh.full_name, employee_id: fresh.employee_id, company_name: company.name,
        invite_link: inviteLink(rawToken, fresh.email),
        meta: { company_id: company._id as Types.ObjectId, related: { type: 'user', id: String(fresh._id) }, session },
      });
      await h.audit(req, {
        action: 'onboarding.first_admin_changed', target_type: 'Company', target_id: String(company._id), company,
        before, after: { email: fresh.email, full_name: fresh.full_name },
      }, session ?? undefined);
      return id;
    });
    h.ok(res, { changed: true, invite_delivery_id: deliveryId ?? null });
  }));

  // Organisations whose first admin has not finished onboarding, each with its stage (CC-ON-1).
  router.get('/onboarding', requirePermission('tenants.read'), asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 100);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? new Types.ObjectId(h.oid(req.query.cursor, 'cursor')) : null;

    const latest = await Invitation.aggregate<{ _id: Types.ObjectId }>([
      { $match: { kind: 'first_admin', company_id: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$company_id', state: { $first: '$state' } } },
      { $match: { state: { $ne: 'accepted' }, ...(cursor ? { _id: { $lt: cursor } } : {}) } },
      { $sort: { _id: -1 } },
      { $limit: limit + 1 },
    ]);
    const page = latest.slice(0, limit);
    const companies = await Company.find({ _id: { $in: page.map((r) => r._id) }, status: { $ne: 'closed' } }).sort({ _id: -1 });

    const rows = [];
    for (const company of companies) {
      const d = await describeOnboarding(company);
      if (d.stage !== 'complete') rows.push(d);
    }
    h.ok(res, rows, 200, { limit, next_cursor: latest.length > limit ? String(page[page.length - 1]._id) : null });
  }));

  return router;
}
