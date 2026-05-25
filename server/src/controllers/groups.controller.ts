import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Group } from '../models/Group.model';
import { GroupMember } from '../models/GroupMember.model';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// Schemas
const CreateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.trim()),
  description: z.string().optional(),
  type: z.enum(['static', 'dynamic']).default('static'),
  dynamic_rules: z.record(z.unknown()).optional(),
});

const UpdateGroupSchema = z.object({
  name: z.string().min(1, 'Name is required').transform(v => v.trim()).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

const AddUsersSchema = z.object({
  userIds: z.array(z.string().min(1)),
});

const RemoveUsersSchema = z.object({
  userIds: z.array(z.string().min(1)),
});

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
  
  if (input.name !== undefined) group.name = input.name;
  if (input.description !== undefined) group.description = input.description;
  if (input.is_active !== undefined) group.is_active = input.is_active;

  await group.save();

  await auditLogger.log({
    req,
    action: 'group.updated',
    module: 'roles_and_permissions',
    object_type: 'Group',
    object_id: group._id.toString(),
    object_label: group.name,
    before_state,
    after_state: group.toObject(),
  });

  res.status(200).json({ success: true, data: group });
});

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  if (!Types.ObjectId.isValid(req.params.id)) {
    throw new AppError('Group not found', 404, 'NOT_FOUND');
  }

  const group = await Group.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!group) throw new AppError('Group not found', 404, 'NOT_FOUND');

  // Check for dependents - actually we will just delete the members alongside the group
  // Or we can say if there are members, you can't delete it.
  const memberCount = await GroupMember.countDocuments({ group_id: group._id });
  if (memberCount > 0) {
    throw new AppError('Cannot delete: Group still has assigned users', 400, 'HAS_DEPENDENTS');
  }

  const before_state = group.toObject();
  await group.deleteOne();

  await auditLogger.log({
    req,
    action: 'group.deleted',
    module: 'roles_and_permissions',
    object_type: 'Group',
    object_id: group._id.toString(),
    object_label: group.name,
    before_state,
    after_state: null,
  });

  res.status(200).json({ success: true, data: { message: 'Group deleted successfully' } });
});

export const getGroupUsers = asyncHandler(async (req: Request, res: Response) => {
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

  const results = [];
  const addedIds = [];
  
  // Validate users and add
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

    const user = await User.findOne({
      _id: userId,
      company_id: req.user.company_id,
    });

    if (!user) {
      results.push({ userId, success: false, error: 'User not found' });
      continue;
    }

    const existingMembership = await GroupMember.findOne({
      group_id: group._id,
      user_id: user._id,
    });

    if (existingMembership) {
      results.push({ userId, success: false, error: 'User already in group' });
      continue;
    }

    await GroupMember.create({
      group_id: group._id,
      user_id: user._id,
      assigned_by: req.user.userId,
    });

    addedIds.push(user._id.toString());
    results.push({ userId, success: true });

    await auditLogger.log({
      req,
      action: 'group.user_added',
      module: 'roles_and_permissions',
      object_type: 'Group',
      object_id: group._id.toString(),
      object_label: group.name,
      before_state: null,
      after_state: { user_id: user._id.toString() },
    });
  }

  res.status(200).json({ success: true, data: { added: addedIds.length, results } });
});

export const removeUsersFromGroup = asyncHandler(async (req: Request, res: Response) => {
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

  const results = [];
  const removedIds = [];
  
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

    const membership = await GroupMember.findOne({
      group_id: group._id,
      user_id: userId,
    });

    if (!membership) {
      results.push({ userId, success: false, error: 'User not in group' });
      continue;
    }

    await membership.deleteOne();

    removedIds.push(userId);
    results.push({ userId, success: true });

    await auditLogger.log({
      req,
      action: 'group.user_removed',
      module: 'roles_and_permissions',
      object_type: 'Group',
      object_id: group._id.toString(),
      object_label: group.name,
      before_state: { user_id: userId },
      after_state: null,
    });
  }

  res.status(200).json({ success: true, data: { removed: removedIds.length, results } });
});
