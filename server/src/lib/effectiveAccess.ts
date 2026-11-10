// server/src/lib/effectiveAccess.ts — 04 §1, §8: member x product -> role
import { Types, ClientSession } from 'mongoose';
import { User } from '../models/User.model';
import { Identity } from '../models/Identity.model';
import { Company } from '../models/Company.model';
import { App } from '../models/App.model';
import { AppAssignment, IAppAssignment } from '../models/AppAssignment.model';
import { ProductRole } from '../models/ProductRole.model';
import { OrganizationEntitlement } from '../models/OrganizationEntitlement.model';
import { Department } from '../models/Department.model';
import { Location } from '../models/Location.model';
import { Group } from '../models/Group.model';
import { GroupMember } from '../models/GroupMember.model';
import { UserRole } from '../models/UserRole.model';
import { ACCESS_STATES } from '../identity/config';

export interface EffectiveAccess {
  member_id: string;
  authz_ver: number;
  products: Record<string, { role: string; role_name: string; granted_by: string[] }>;
  denials: Record<string, string>;
}

const DYNAMIC_RULE_FIELDS = ['department_id', 'lifecycle_state', 'employment_type', 'location_id', 'job_title'];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Increment authz_ver for the given members (04 §8.2). */
export async function bumpAuthzVer(memberIds: Array<string | Types.ObjectId>, session?: ClientSession): Promise<void> {
  if (memberIds.length === 0) return;
  await User.updateMany({ _id: { $in: memberIds } }, { $inc: { authz_ver: 1 } }, { session });
}

function dynamicGroupFilter(rules: Record<string, unknown> | undefined): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rules ?? {})) {
    if (DYNAMIC_RULE_FIELDS.includes(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) f[k] = v;
  }
  return f; // empty -> all members (e.g. "All Members")
}

/** root + descendants (parent_id tree), company scoped */
async function descendantIds(Model: any, companyId: Types.ObjectId | string, rootId: Types.ObjectId, session?: ClientSession): Promise<Types.ObjectId[]> {
  const seen = new Set<string>([rootId.toString()]);
  let frontier: Types.ObjectId[] = [rootId];
  while (frontier.length) {
    const kids = await Model.find({ company_id: companyId, parent_id: { $in: frontier } }).select('_id').session(session ?? null).lean();
    frontier = kids.map((k: any) => k._id).filter((id: Types.ObjectId) => !seen.has(id.toString()));
    frontier.forEach(id => seen.add(id.toString()));
  }
  return Array.from(seen).map(s => new Types.ObjectId(s));
}

/** node + ancestors chain */
async function ancestorIds(Model: any, companyId: Types.ObjectId | string, startId: Types.ObjectId, session?: ClientSession): Promise<Types.ObjectId[]> {
  const out: Types.ObjectId[] = [];
  const seen = new Set<string>();
  let cur: Types.ObjectId | undefined = startId;
  while (cur && !seen.has(cur.toString())) {
    seen.add(cur.toString());
    out.push(cur);
    const node: any = await Model.findOne({ _id: cur, company_id: companyId }).select('parent_id').session(session ?? null).lean();
    cur = node?.parent_id ?? undefined;
  }
  return out;
}

/** Member ids an assignment currently applies to (used to bump authz_ver). */
export async function resolveAssignmentMemberIds(a: Pick<IAppAssignment, 'company_id' | 'target_type' | 'target_id' | 'attribute_name' | 'attribute_value' | 'include_descendants'>, session?: ClientSession): Promise<Types.ObjectId[]> {
  const companyId = a.company_id;
  let filter: any;
  switch (a.target_type) {
    case 'user':
      return a.target_id ? [a.target_id] : [];
    case 'group': {
      const g = await Group.findById(a.target_id).session(session ?? null).lean();
      if (g?.type === 'dynamic') { filter = dynamicGroupFilter(g.dynamic_rules); break; }
      const gm = await GroupMember.find({ group_id: a.target_id }).select('user_id').session(session ?? null).lean();
      return gm.map(m => m.user_id as Types.ObjectId);
    }
    case 'department': {
      const ids = a.include_descendants === false ? [a.target_id!] : await descendantIds(Department, companyId, a.target_id!, session);
      filter = { department_id: { $in: ids } };
      break;
    }
    case 'location': {
      const ids = a.include_descendants === false ? [a.target_id!] : await descendantIds(Location, companyId, a.target_id!, session);
      filter = { location_id: { $in: ids } };
      break;
    }
    case 'role': {
      const ur = await UserRole.find({ role_id: a.target_id, company_id: companyId }).select('user_id').session(session ?? null).lean();
      return ur.map(r => r.user_id as Types.ObjectId);
    }
    case 'attribute': {
      if (a.attribute_name === 'domain') {
        filter = { email: { $regex: `@${escapeRe(String(a.attribute_value))}$`, $options: 'i' } };
      } else if (a.attribute_name && DYNAMIC_RULE_FIELDS.includes(a.attribute_name)) {
        filter = { [a.attribute_name]: a.attribute_value };
      } else return [];
      break;
    }
    default: return [];
  }
  const users = await User.find({ company_id: companyId, ...filter }).select('_id').session(session ?? null).lean();
  return users.map(u => u._id as Types.ObjectId);
}

export async function computeEffectiveAccess(companyId: string | Types.ObjectId, memberId: string | Types.ObjectId, opts?: { session?: ClientSession }): Promise<EffectiveAccess> {
  const session = opts?.session ?? null;
  const user = await User.findOne({ _id: memberId, company_id: companyId }).session(session).lean();
  const result: EffectiveAccess = { member_id: String(memberId), authz_ver: user?.authz_ver ?? 0, products: {}, denials: {} };
  if (!user) return result;

  const products = await App.find({ app_type: 'karbexa_product', company_id: { $exists: false } }).session(session).lean();
  const denyAll = (reason: string) => { for (const p of products) if (p.product_key) result.denials[p.product_key] = reason; return result; };

  const company = await Company.findById(companyId).select('status').session(session).lean();
  if (!company || (company.status ?? 'active') !== 'active') return denyAll('ORG_SUSPENDED');
  if (!(ACCESS_STATES as readonly string[]).includes(user.lifecycle_state) || user.is_active === false) return denyAll('MEMBER_NOT_ACTIVE');
  if (user.identity_id) {
    const identity = await Identity.findById(user.identity_id).select('status').session(session).lean();
    if (!identity || identity.status !== 'active') return denyAll('IDENTITY_NOT_ACTIVE');
  }

  const loadGroupMemberships = () => GroupMember.find({ user_id: user._id }).select('group_id').session(session).lean();
  const loadUserRoles = () => UserRole.find({ user_id: user._id, company_id: companyId }).select('role_id').session(session).lean();
  const loadDeptChain = () => user.department_id ? ancestorIds(Department, companyId, user.department_id, opts?.session) : Promise.resolve([] as Types.ObjectId[]);
  const loadLocChain = () => user.location_id ? ancestorIds(Location, companyId, user.location_id, opts?.session) : Promise.resolve([] as Types.ObjectId[]);
  const loadDynGroups = () => Group.find({ company_id: companyId, type: 'dynamic', is_active: true }).session(session).lean();
  let groupMemberships, userRoles, deptChain, locChain, dynGroups;
  if (opts?.session) {
    // Operations on one transaction session must not run concurrently.
    groupMemberships = await loadGroupMemberships();
    userRoles = await loadUserRoles();
    deptChain = await loadDeptChain();
    locChain = await loadLocChain();
    dynGroups = await loadDynGroups();
  } else {
    [groupMemberships, userRoles, deptChain, locChain, dynGroups] = await Promise.all([loadGroupMemberships(), loadUserRoles(), loadDeptChain(), loadLocChain(), loadDynGroups()]);
  }
  const groupIds = new Set(groupMemberships.map(g => g.group_id.toString()));
  for (const g of dynGroups) {
    const rules = dynamicGroupFilter(g.dynamic_rules);
    if (Object.entries(rules).every(([k, v]) => String((user as any)[k]) === String(v))) groupIds.add(g._id.toString());
  }
  const roleIds = new Set(userRoles.map(r => r.role_id.toString()));
  const deptSelf = user.department_id?.toString();
  const locSelf = user.location_id?.toString();
  const deptAnc = new Set(deptChain.map(String));
  const locAnc = new Set(locChain.map(String));
  const domain = user.email?.split('@')[1]?.toLowerCase();

  const assignments = await AppAssignment.find({ company_id: companyId, is_active: true, app_id: { $in: products.map(p => p._id) } }).session(session).lean();
  const appById = new Map(products.map(p => [p._id.toString(), p]));

  const matches = (a: any): boolean => {
    const tid = a.target_id?.toString();
    switch (a.target_type) {
      case 'user': return tid === user._id.toString();
      case 'group': return groupIds.has(tid);
      case 'role': return roleIds.has(tid);
      case 'department': return a.include_descendants === false ? tid === deptSelf : deptAnc.has(tid);
      case 'location': return a.include_descendants === false ? tid === locSelf : locAnc.has(tid);
      case 'attribute':
        if (a.attribute_name === 'domain') return domain === String(a.attribute_value).toLowerCase();
        if (!DYNAMIC_RULE_FIELDS.includes(a.attribute_name)) return false;
        return String((user as any)[a.attribute_name]) === String(a.attribute_value);
      default: return false;
    }
  };
  const matched = assignments.filter(matches);

  const entitlements = await OrganizationEntitlement.find({ company_id: companyId, status: 'active' }).select('product_key').session(session).lean();
  const entitled = new Set<string>(entitlements.map(e => e.product_key));
  const roleCatalog = await ProductRole.find({ product_key: { $in: products.map(p => p.product_key!) } }).session(session).lean();
  const roleByKey = new Map(roleCatalog.map(r => [`${r.product_key}:${r.key}`, r]));

  const byProduct = new Map<string, any[]>();
  for (const a of matched) {
    const pk = appById.get(a.app_id.toString())?.product_key;
    if (pk) byProduct.set(pk, [...(byProduct.get(pk) ?? []), a]);
  }

  for (const p of products) {
    const pk = p.product_key!;
    const list = byProduct.get(pk);
    if (!list) { result.denials[pk] = 'NO_ASSIGNMENT'; continue; }
    if (!entitled.has(pk)) { result.denials[pk] = 'NO_ENTITLEMENT'; continue; }
    let best: { rank: number; key: string; name: string } | undefined;
    for (const a of list) {
      const key = a.product_role_key || p.default_role_key;
      const role = key ? roleByKey.get(`${pk}:${key}`) : undefined;
      if (role && (!best || role.rank > best.rank)) best = { rank: role.rank, key: role.key, name: role.name };
    }
    if (!best) { result.denials[pk] = 'NO_ROLE'; continue; }
    result.products[pk] = { role: best.key, role_name: best.name, granted_by: list.map(a => a._id.toString()) };
  }
  return result;
}
