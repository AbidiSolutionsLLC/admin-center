import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Group } from '../models/Group.model';
import { GroupMember } from '../models/GroupMember.model';
import { User } from '../models/User.model';
import { runInTransaction, emitAppAccessChangedBounded, correlationIdFor } from '../lib/platformEvents';
import { dynamicGroupFilter } from '../lib/effectiveAccess';
import { AppAssignment } from '../models/AppAssignment.model';
import type { ClientSession } from 'mongoose';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// Schemas
const CreateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.trim()),
  description: z.string().optional(),
  type: z.enum(['static', 'dynamic']).default('static'),
  dynamic_rules: z.record(z.string(), z.unknown()).optional(),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.trim()).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
  dynamic_rules: z.record(z.string(), z.unknown()).optional(),
});

const AddUsersSchema = z.object({
  userIds: z.array(z.string().min(1)),
});

const RemoveUsersSchema = z.object({
  userIds: z.array(z.string().min(1)),
});

/** Members a group currently covers: static = GroupMember rows, dynamic = users matching its rules (company scoped). */
async function groupMemberIds(
  group: { _id: Types.ObjectId; company_id: Types.ObjectId; type: string; dynamic_rules?: Record<string, unknown> },
  session: ClientSession | undefined,
  rulesOverride?: Record<string, unknown>,
): Promise<string[]> {
  if (group.type === 'dynamic') {
    const rows = await User.find({ company_id: group.company_id, ...dynamicGroupFilter(rulesOverride ?? group.dynamic_rules) })
      .select('_id').session(session ?? null).lean();
    return rows.map(r => String(r._id));
  }
  const rows = await GroupMember.find({ group_id: group._id }).select('user_id').session(session ?? null).lean();
  return rows.map(r => String(r.user_id));
}

export const getGroups = asyncHandler(async (req: Request, res: Response) => {
  const groups = await Group.find({
    company_id: req.user.company_id,
  }).sort({ created_at: -1 });

  // Add user counts
  const groupIds = groups.map(g => g._id);
  const memberCounts = await GroupMember.aggregate([
    { $match: { group_id: { $in: groupIds } } },
    { $group: { _id: '$group_id', count: { $sum: 1 } } }
  ]);

  const countMap = new Map(memberCounts.map(m => [m._id.toString(), m.count]));

  const data = groups.map(g => ({
    ...g.toObject(),
    user_count: countMap.get(g._id.toString()) || 0,
  }));

  res.status(200).json({ success: true, data });
});

export const getGroupById = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');

  const user_count = await GroupMember.countDocuments({ group_id: group._id });

  res.status(200).json({ success: true, data: { ...group.toObject(), user_count } });
});

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateGroupSchema.parse(req.body);

  if (input.name.length === 0) {
    throw new AppError('Name cannot be empty', 400, 'VALIDATION_ERROR');
  }

  // Duplicate check
  const existing = await Group.findOne({
    name: { $regex: `^${input.name}$`, $options: 'i' },
    company_id: req.user.company_id,
  });
  if (existing) throw new AppError('Group already exists', 400, 'DUPLICATE');

  const group = await Group.create({
    ...input,
    company_id: req.user.company_id,
  });

  await auditLogger.log({
    req,
    action: 'group.created',
    module: 'roles_and_permissions',
    object_type: 'Group',
    object_id: group._id.toString(),
    object_label: group.name,
    before_state: null,
    after_state: group.toObject(),
  });

  res.status(201).json({ success: true, data: group });
});

export const updateGroup = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const input = UpdateGroupSchema.parse(req.body);

  if (input.name !== undefined && input.name.length === 0) {
    throw new AppError('Name cannot be empty', 400, 'VALIDATION_ERROR');
  }

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');

  if (input.name && input.name.toLowerCase() !== group.name.toLowerCase()) {
    const existing = await Group.findOne({
      name: { $regex: `^${input.name}$`, $options: 'i' },
      company_id: req.user.company_id,
    });
    if (existing) throw new AppError('Group already exists', 400, 'DUPLICATE');
  }

  const before_state = group.toObject();
  const wasActive = group.is_active;
  const oldRules = group.dynamic_rules;

  if (input.name !== undefined) group.name = input.name;
  if (input.description !== undefined) group.description = input.description;
  if (input.is_active !== undefined) group.is_active = input.is_active;

  const rulesChanged = group.type === 'dynamic' && input.dynamic_rules !== undefined
    && JSON.stringify(input.dynamic_rules) !== JSON.stringify(group.dynamic_rules ?? {});
  if (rulesChanged) group.dynamic_rules = input.dynamic_rules;
  const activeChanged = group.is_active !== wasActive;

  const correlation_id = correlationIdFor(req);
  await runInTransaction(async (session) => {
    await group.save({ session: session ?? undefined });
    if (rulesChanged || activeChanged) {
      // Members covered before and after the change (rule change: old matches lose, new matches gain; is_active: same set)
      const affected = new Set(await groupMemberIds(group, session));
      if (rulesChanged) for (const id of await groupMemberIds(group, session, oldRules)) affected.add(id);
      await emitAppAccessChangedBounded(session, req.user.company_id, [...affected], {
        actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
      });
    }

    await auditLogger.logTx(session, {
      req,
      correlation_id,
      action: 'group.updated',
      module: 'roles_and_permissions',
      object_type: 'Group',
      object_id: group._id.toString(),
      object_label: group.name,
      before_state,
      after_state: group.toObject(),
    });
  });

  res.status(200).json({ success: true, data: group });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');

  const memberCount = await GroupMember.countDocuments({ group_id: group._id });
  if (memberCount > 0) {
    throw new AppError('Cannot delete: Group still has assigned users', 400, 'HAS_DEPENDENTS');
  }

  const before_state = group.toObject();
  const correlation_id = correlationIdFor(req);
  await runInTransaction(async (session) => {
    // Active assignments targeting the group must be revoked first (D-5: conservative 409, no silent revoke)
    const inUse = await AppAssignment.countDocuments({
      company_id: req.user.company_id, target_type: 'group', target_id: group._id, is_active: true,
    }).session(session ?? null);
    if (inUse > 0) {
      throw new AppError('Cannot delete: active app assignments target this group', 409, 'GROUP_IN_USE');
    }
    // Resolve the members the group covers BEFORE deleting (dynamic groups have no GroupMember rows)
    const affected = group.is_active ? await groupMemberIds(group, session) : [];
    await Group.deleteOne({ _id: group._id, company_id: req.user.company_id }, { session: session ?? undefined });
    await emitAppAccessChangedBounded(session, req.user.company_id, affected, {
      actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    });
    await auditLogger.logTx(session, {
      req,
      correlation_id,
      action: 'group.deleted',
      module: 'roles_and_permissions',
      object_type: 'Group',
      object_id: group._id.toString(),
      object_label: group.name,
      before_state,
      after_state: null,
    });
  });

  res.status(200).json({ success: true, data: { message: 'Group deleted successfully' } });
});

export const getGroupUsers = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');

  const members = await GroupMember.find({ group_id: group._id })
    .populate({
      path: 'user_id',
      select: 'full_name email avatar_url is_active lifecycle_state',
    })
    .sort({ assigned_at: -1 });

  res.status(200).json({ success: true, data: members });
});

export const addUsersToGroup = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const input = AddUsersSchema.parse(req.body);

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  });

  if (!group) throw new AppError('Group not found or access denied', 404, 'NOT_FOUND');
  if (group.type === 'dynamic') {
    throw new AppError('Cannot manually assign users to a dynamic group', 400, 'INVALID_ACTION');
  }

  const results: { userId: string; success: boolean; error?: string }[] = [];
  const addedIds: string[] = [];
  const correlation_id = correlationIdFor(req);

  await runInTransaction(async (session) => {
    results.length = 0; // a retried transaction attempt starts clean
    addedIds.length = 0;
    const seen = new Set<string>();
    for (const userId of input.userIds) {
      if (!Types.ObjectId.isValid(userId)) {
        results.push({ userId, success: false, error: 'Invalid ID' });
        continue;
      }
      if (seen.has(userId)) {
        results.push({ userId, success: false, error: 'Duplicate in payload' });
        continue;
      }
      seen.add(userId);

      const user = await User.findOne({ _id: userId, company_id: req.user.company_id }).session(session ?? null);
      if (!user) {
        results.push({ userId, success: false, error: 'User not found' });
        continue;
      }
      const existingMembership = await GroupMember.findOne({ group_id: group._id, user_id: user._id }).session(session ?? null);
      if (existingMembership) {
        results.push({ userId, success: false, error: 'User already in group' });
        continue;
      }

      await GroupMember.create([{ group_id: group._id, user_id: user._id, assigned_by: req.user.userId }], { session: session ?? undefined });
      addedIds.push(user._id.toString());
      results.push({ userId, success: true });

      await auditLogger.logTx(session, {
        req,
        correlation_id,
        action: 'group.user_added',
        module: 'roles_and_permissions',
        object_type: 'Group',
        object_id: group._id.toString(),
        object_label: group.name,
        before_state: null,
        after_state: { user_id: user._id.toString() },
      });
    }
    await emitAppAccessChangedBounded(session, req.user.company_id, addedIds, {
      actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    });
  });

  res.status(200).json({ success: true, data: { added: addedIds.length, results } });
});

export const removeUsersFromGroup = asyncHandler(async (req: Request, res: Response) => {
  // @ts-ignore
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const input = RemoveUsersSchema.parse(req.body);

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');
  if (group.type === 'dynamic') {
    throw new AppError('Cannot manually remove users from a dynamic group', 400, 'INVALID_ACTION');
  }

  const results: { userId: string; success: boolean; error?: string }[] = [];
  const removedIds: string[] = [];
  const correlation_id = correlationIdFor(req);

  await runInTransaction(async (session) => {
    results.length = 0; // a retried transaction attempt starts clean
    removedIds.length = 0;
    const seen = new Set<string>();
    for (const userId of input.userIds) {
      if (!Types.ObjectId.isValid(userId)) {
        results.push({ userId, success: false, error: 'Invalid ID' });
        continue;
      }
      if (seen.has(userId)) {
        results.push({ userId, success: false, error: 'Duplicate in payload' });
        continue;
      }
      seen.add(userId);

      const membership = await GroupMember.findOne({ group_id: group._id, user_id: userId }).session(session ?? null);
      if (!membership) {
        results.push({ userId, success: false, error: 'User not in group' });
        continue;
      }

      await GroupMember.deleteOne({ _id: membership._id }, { session: session ?? undefined });
      removedIds.push(userId);
      results.push({ userId, success: true });

      await auditLogger.logTx(session, {
        req,
        correlation_id,
        action: 'group.user_removed',
        module: 'roles_and_permissions',
        object_type: 'Group',
        object_id: group._id.toString(),
        object_label: group.name,
        before_state: { user_id: userId },
        after_state: null,
      });
    }
    await emitAppAccessChangedBounded(session, req.user.company_id, removedIds, {
      actor: { type: 'member', id: String(req.user.userId) }, correlation_id,
    });
  });

  res.status(200).json({ success: true, data: { removed: removedIds.length, results } });
});
