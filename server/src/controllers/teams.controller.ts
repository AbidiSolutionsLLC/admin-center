// server/src/controllers/teams.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { Team } from '../models/Team.model';
import { TeamMember } from '../models/TeamMember.model';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const CreateTeamSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  department_id: z.string().optional().nullable(),
  team_lead_id: z.string().optional().nullable(),
});

const UpdateTeamSchema = CreateTeamSchema.partial();

const AddMemberSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  role: z.enum(['member', 'lead', 'admin']).default('member'),
});

const UpdateMemberSchema = AddMemberSchema.partial();

// ── Team Controllers ─────────────────────────────────────────────────────────

/**
 * GET /teams
 * Returns all active teams for the requesting company.
 */
export const getTeams = asyncHandler(async (req: Request, res: Response) => {
  const teams = await Team.find({
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('team_lead_id', 'full_name avatar_url email')
    .populate('department_id', 'name slug')
    .sort({ created_at: 1 })
    .lean();

  res.status(200).json({ success: true, data: teams });
});

/**
 * GET /teams/:id
 * Returns a single team by ID, scoped to the company.
 */
export const getTeamById = asyncHandler(async (req: Request, res: Response) => {
  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any)
    .populate('team_lead_id', 'full_name avatar_url email')
    .populate('department_id', 'name slug');

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({ success: true, data: team });
});

/**
 * POST /teams
 * Creates a new team scoped to the requesting company's tenant.
 */
export const createTeam = asyncHandler(async (req: Request, res: Response) => {
  const input = CreateTeamSchema.parse(req.body);

  const team = await Team.create({
    ...input,
    department_id: input.department_id || undefined,
    team_lead_id: input.team_lead_id || undefined,
    company_id: req.user.company_id,
  } as any);

  await auditLogger.log({
    req,
    action: 'team.created',
    module: 'organization',
    object_type: 'Team',
    object_id: team._id.toString(),
    object_label: team.name,
    before_state: null,
    after_state: team.toObject(),
  });

  res.status(201).json({ success: true, data: team });
});

/**
 * PUT /teams/:id
 * Updates an existing team, scoped to the company tenant.
 */
export const updateTeam = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateTeamSchema.parse(req.body);

  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  const beforeState = team.toObject();

  const updates: Record<string, unknown> = { ...input };
  if (updates.department_id === '') updates.department_id = null;
  if (updates.team_lead_id === '') updates.team_lead_id = null;

  Object.assign(team, updates);
  await team.save();

  await auditLogger.log({
    req,
    action: 'team.updated',
    module: 'organization',
    object_type: 'Team',
    object_id: team._id.toString(),
    object_label: team.name,
    before_state: beforeState,
    after_state: team.toObject(),
  });

  res.status(200).json({ success: true, data: team });
});

/**
 * DELETE /teams/:id
 * Soft-deletes a team. Blocked if team has active members (409).
 */
export const deleteTeam = asyncHandler(async (req: Request, res: Response) => {
  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  // Block deletion if team has active members
  const memberCount = await TeamMember.countDocuments({
    company_id: req.user.company_id,
    team_id: team._id,
  } as any);

  if (memberCount > 0) {
    throw new AppError(
      'Cannot delete team with active members. Remove all members first.',
      409,
      'TEAM_HAS_ACTIVE_MEMBERS'
    );
  }

  const beforeState = team.toObject();

  team.is_active = false;
  await team.save();

  await auditLogger.log({
    req,
    action: 'team.deleted',
    module: 'organization',
    object_type: 'Team',
    object_id: team._id.toString(),
    object_label: team.name,
    before_state: beforeState,
    after_state: team.toObject(),
  });

  res.status(200).json({ success: true, data: {} });
});

// ── Team Member Controllers ──────────────────────────────────────────────────

/**
 * GET /teams/:id/members
 * Returns all members of a specific team.
 */
export const getTeamMembers = asyncHandler(async (req: Request, res: Response) => {
  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  const members = await TeamMember.find({
    company_id: req.user.company_id,
    team_id: team._id,
  } as any)
    .populate('user_id', 'full_name email avatar_url employee_id')
    .sort({ joined_at: 1 })
    .lean();

  res.status(200).json({ success: true, data: members });
});

/**
 * POST /teams/:id/members
 * Adds a user to a team.
 */
export const addTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const input = AddMemberSchema.parse(req.body);

  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  // Verify user exists and belongs to the same company
  const user = await User.findOne({
    _id: input.user_id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const member = await TeamMember.create({
    company_id: req.user.company_id,
    team_id: team._id,
    user_id: user._id,
    role: input.role,
  } as any);

  await auditLogger.log({
    req,
    action: 'team.member_added',
    module: 'organization',
    object_type: 'TeamMember',
    object_id: member._id.toString(),
    object_label: `${user.full_name} added to ${team.name}`,
    before_state: null,
    after_state: member.toObject(),
  });

  const populated = await TeamMember.findById(member._id)
    .populate('user_id', 'full_name email avatar_url employee_id');

  res.status(201).json({ success: true, data: populated });
});

/**
 * PUT /teams/:id/members/:memberId
 * Updates a team member's role.
 */
export const updateTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const input = UpdateMemberSchema.parse(req.body);

  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  const member = await TeamMember.findOne({
    _id: req.params.memberId,
    company_id: req.user.company_id,
    team_id: team._id,
  } as any);

  if (!member) {
    throw new AppError('Team member not found', 404, 'NOT_FOUND');
  }

  const beforeState = member.toObject();

  Object.assign(member, input);
  await member.save();

  await auditLogger.log({
    req,
    action: 'team.member_updated',
    module: 'organization',
    object_type: 'TeamMember',
    object_id: member._id.toString(),
    object_label: `Updated member in ${team.name}`,
    before_state: beforeState,
    after_state: member.toObject(),
  });

  const populated = await TeamMember.findById(member._id)
    .populate('user_id', 'full_name email avatar_url employee_id');

  res.status(200).json({ success: true, data: populated });
});

/**
 * DELETE /teams/:id/members/:memberId
 * Removes a user from a team.
 */
export const removeTeamMember = asyncHandler(async (req: Request, res: Response) => {
  const team = await Team.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
    is_active: true,
  } as any);

  if (!team) {
    throw new AppError('Team not found', 404, 'NOT_FOUND');
  }

  const member = await TeamMember.findOne({
    _id: req.params.memberId,
    company_id: req.user.company_id,
    team_id: team._id,
  } as any);

  if (!member) {
    throw new AppError('Team member not found', 404, 'NOT_FOUND');
  }

  const beforeState = member.toObject();
  const user = await User.findById(member.user_id);

  await member.deleteOne();

  await auditLogger.log({
    req,
    action: 'team.member_removed',
    module: 'organization',
    object_type: 'TeamMember',
    object_id: member._id.toString(),
    object_label: `${user?.full_name ?? 'Unknown'} removed from ${team.name}`,
    before_state: beforeState,
    after_state: null,
  });

  res.status(200).json({ success: true, data: {} });
});
