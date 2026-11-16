// server/src/lib/seats.ts
// Seats (Plan 4.7, DRD 3.2 rule 6). A seat is a member who can use a product: an active-state member of an active
// tenant, reached by an active assignment of the product's app, while the tenant's entitlement for it is active.
// `SeatUsage` holds the last count per tenant and product; it is recomputed after access changes (never on page load).
// An assignment that would push the count over `seats_limit` is refused with 409 SEAT_LIMIT_REACHED; growth through
// dynamic groups is not blocked, it only shows up in the count.
import { Types, ClientSession } from 'mongoose';
import { Company } from '../models/Company.model';
import { User } from '../models/User.model';
import { App } from '../models/App.model';
import { AppAssignment, IAppAssignment } from '../models/AppAssignment.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { SeatUsage } from '../models/SeatUsage.model';
import { ACCESS_STATES } from '../identity/config';
import { resolveAssignmentMemberIds } from './effectiveAccess';
import { AppError } from '../utils/AppError';

type AssignmentShape = Pick<IAppAssignment, 'company_id' | 'target_type' | 'target_id' | 'attribute_name' | 'attribute_value' | 'include_descendants'>;

/** Ids from `candidates` that are members who may use products at all (active tenant member state). Company-scoped. */
async function eligibleMembers(companyId: Types.ObjectId | string, candidates: Types.ObjectId[], session?: ClientSession | null): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const rows = await User.find({
    _id: { $in: candidates }, company_id: companyId, is_active: { $ne: false }, lifecycle_state: { $in: [...ACCESS_STATES] },
  }).select('_id').session(session ?? null).lean();
  return new Set(rows.map((r) => String(r._id)));
}

/** The members who hold a seat for `productKey` right now. Empty when the tenant or the entitlement is not active. */
export async function seatHolders(companyId: Types.ObjectId | string, productKey: string, session?: ClientSession | null): Promise<Set<string>> {
  const company = await Company.findById(companyId).select('status').session(session ?? null).lean();
  if (!company || (company.status ?? 'active') !== 'active') return new Set();
  if (!(await OrganizationEntitlement.exists({ company_id: companyId, product_key: productKey, status: 'active' }).session(session ?? null))) return new Set();
  const app = await App.findOne({ app_type: 'karbexa_product', product_key: productKey, company_id: { $exists: false } }).select('_id').session(session ?? null).lean();
  if (!app) return new Set();
  const assignments = await AppAssignment.find({ company_id: companyId, app_id: app._id, is_active: true }).session(session ?? null);
  const ids = new Map<string, Types.ObjectId>();
  for (const a of assignments) for (const id of await resolveAssignmentMemberIds(a, session ?? undefined)) ids.set(String(id), id);
  return eligibleMembers(companyId, [...ids.values()], session);
}

/** Count and store the seats in use for each product of the tenant (or only `productKeys`). */
export async function recomputeSeatUsage(companyId: Types.ObjectId | string, productKeys?: string[]): Promise<void> {
  const keys = productKeys ?? (await App.find({ app_type: 'karbexa_product', company_id: { $exists: false } }).select('product_key').lean()).map((a) => a.product_key as string).filter(Boolean);
  const computed_at = new Date();
  for (const key of keys) {
    const used = (await seatHolders(companyId, key)).size;
    await SeatUsage.updateOne({ company_id: companyId, product_key: key }, { $set: { used, computed_at } }, { upsert: true });
  }
}

const pending = new Map<string, NodeJS.Timeout>();
const COALESCE_MS = 1000;

/**
 * Recompute the tenant's seat usage soon, once for a burst of access changes (the access fan-out calls this for every
 * batch). Errors are logged, never thrown; the timer does not keep the process alive.
 */
export function scheduleSeatRecompute(companyId: Types.ObjectId | string): void {
  const key = String(companyId);
  if (pending.has(key)) return;
  const t = setTimeout(() => {
    pending.delete(key);
    recomputeSeatUsage(key).catch((err) => console.error('[seats] recompute failed', key, err));
  }, COALESCE_MS);
  t.unref();
  pending.set(key, t);
}

/**
 * Refuse an assignment that would take the tenant past `seats_limit` for the product. `candidate` is the assignment
 * as it would be (new, or an existing one being widened); the members it would add are those not already holding a
 * seat. No limit, or no new member: nothing to check.
 */
export async function assertSeatsAvailable(
  companyId: Types.ObjectId | string, productKey: string, seatsLimit: number | null | undefined, candidate: AssignmentShape, session?: ClientSession | null,
): Promise<void> {
  if (seatsLimit === null || seatsLimit === undefined) return;
  const holders = await seatHolders(companyId, productKey, session);
  const wanted = await eligibleMembers(companyId, await resolveAssignmentMemberIds(candidate, session ?? undefined), session);
  const requested = [...wanted].filter((id) => !holders.has(id)).length;
  if (requested > 0 && holders.size + requested > seatsLimit) {
    throw new AppError(`This would use ${holders.size + requested} seats; the limit is ${seatsLimit}.`, 409, 'SEAT_LIMIT_REACHED', {
      product_key: productKey, limit: seatsLimit, used: holders.size, requested,
    });
  }
}
