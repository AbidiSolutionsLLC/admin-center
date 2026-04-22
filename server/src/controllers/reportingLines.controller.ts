// server/src/controllers/reportingLines.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const AddSecondaryManagerSchema = z.object({
  manager_id: z.string().min(1, 'Manager ID is required'),
});

const RemoveSecondaryManagerSchema = z.object({
  manager_id: z.string().min(1, 'Manager ID is required'),
});

const ChangePrimaryManagerSchema = z.object({
  manager_id: z.string().nullable(),
});

// ── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Checks if adding a secondary manager would create a circular reporting chain.
 * A circular chain occurs if the target user (who would report to the manager)
 * is already in the manager's reporting chain (directly or indirectly).
 */
export async function wouldCreateCircularChain(
  userId: string,
  managerId: string,
  companyId: string
): Promise<boolean> {
  // If user is trying to be their own secondary manager
  if (userId === managerId) {
    return true;
  }

  // Check if the manager already reports to the user (directly or indirectly)
  // We need to traverse up the manager chain from the managerId
  const visited = new Set<string>();
  let currentManagerId: string | null = managerId;

  while (currentManagerId) {
    if (currentManagerId === userId) {
      return true; // Circular chain detected
    }

    if (visited.has(currentManagerId)) {
      break; // Prevent infinite loops in case of existing circular chains
    }

    visited.add(currentManagerId);

    const manager = await User.findOne({
      _id: new Types.ObjectId(currentManagerId),
      company_id: new Types.ObjectId(companyId),
    }).lean();

    if (!manager) {
      break;
    }

    // Check primary manager
    currentManagerId = manager.manager_id?.toString() ?? null;

    // If we've checked the primary manager and need to check secondary managers
    // This is a simplification - we check if user is in any secondary manager's chain
    if (!currentManagerId) {
      break;
    }
  }

  // Also check: if manager already has this user as their primary manager,
  // adding as secondary would be redundant but not circular
  // The real circular check is: does the manager (or anyone who reports to them)
  // already have the user as their manager?
  
  // Check if any user who reports to managerId (directly or indirectly) 
  // has userId as their manager
  async function getAllDirectReports(managerId: string): Promise<string[]> {
    const directReports = await User.find({
      company_id: new Types.ObjectId(companyId),
      $or: [
        { manager_id: new Types.ObjectId(managerId) },
        { secondary_manager_ids: new Types.ObjectId(managerId) },
      ],
    }).lean();

    const reportIds = directReports.map(u => u._id.toString());
    
    // Recursively get indirect reports
    for (const reportId of reportIds) {
      const indirectReports = await getAllDirectReports(reportId);
      reportIds.push(...indirectReports);
    }

    return reportIds;
  }

  const managerReports = await getAllDirectReports(managerId);
  if (managerReports.includes(userId)) {
    return true;
  }

  return false;
}

/**
 * Checks if a user is trying to assign themselves as their own manager
 */
function isSelfAssignment(userId: string, managerId: string): boolean {
  return userId === managerId;
}

/**
 * Enriches a user object with populated manager fields
 */
export async function enrichUserWithManagers(user: any) {
  // If user is a Mongoose document, convert to object
  const enriched = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  
  if (enriched.manager_id && typeof enriched.manager_id === 'object') {
    enriched.manager = enriched.manager_id;
  }
  
  if (enriched.secondary_manager_ids && Array.isArray(enriched.secondary_manager_ids)) {
    enriched.secondary_managers = enriched.secondary_manager_ids
      .map((m: any) => {
        if (typeof m === 'object' && m !== null) {
          return {
            _id: m._id,
            full_name: m.full_name,
            email: m.email,
            avatar_url: m.avatar_url,
          };
        }
        return m;
      })
      .filter((m: any) => typeof m === 'object' && m !== null && m._id);
  } else {
    enriched.secondary_managers = [];
  }

  return enriched;
}

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /people/:id/reporting-line
 * Returns the full reporting line for a user including:
 * - primary manager
 * - secondary managers
 * - direct reports (users who report to this user)
 */
export const getReportingLine = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  })
    .populate('manager_id', 'full_name email avatar_url')
    .populate('secondary_manager_ids', 'full_name email avatar_url')
    .lean();

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Get direct reports (users who have this user as their primary or secondary manager)
  const directReports = await User.find({
    company_id: req.user.company_id,
    $or: [
      { manager_id: user._id },
      { secondary_manager_ids: user._id },
    ],
  })
    .select('full_name email avatar_url manager_id secondary_manager_ids')
    .populate('manager_id', 'full_name email avatar_url')
    .populate('secondary_manager_ids', 'full_name email avatar_url')
    .lean();

  const enrichedUser = await enrichUserWithManagers(user);

  res.status(200).json({
    success: true,
    data: {
      user: {
        _id: enrichedUser._id,
        full_name: enrichedUser.full_name,
        email: enrichedUser.email,
        avatar_url: enrichedUser.avatar_url,
      },
      primary_manager: enrichedUser.manager || null,
      secondary_managers: enrichedUser.secondary_managers || [],
      direct_reports: directReports.map(report => ({
        _id: report._id,
        full_name: report.full_name,
        email: report.email,
        avatar_url: report.avatar_url,
        reports_as: (report.manager_id?._id.toString() === user._id.toString()) ? 'primary' : 'secondary',
      })),
    },
  });
});

/**
 * POST /people/:id/reporting-line/secondary
 * Adds a secondary manager to a user.
 * Validates:
 * - Cannot assign self as manager
 * - Cannot create circular reporting chain
 * - Manager must exist in the same company
 * Produces audit event: user.secondary_manager_added
 */
export const addSecondaryManager = asyncHandler(async (req: Request, res: Response) => {
  const input = AddSecondaryManagerSchema.parse(req.body);

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // Validate manager exists and belongs to same company
  const manager = await User.findOne({
    _id: input.manager_id,
    company_id: req.user.company_id,
  });

  if (!manager) {
    throw new AppError('Manager not found or does not belong to this company', 404, 'MANAGER_NOT_FOUND');
  }

  // Check for self-assignment
  if (isSelfAssignment(user._id.toString(), input.manager_id)) {
    throw new AppError('Cannot assign yourself as your own manager', 400, 'SELF_ASSIGNMENT_NOT_ALLOWED');
  }

  // Enforce maximum 10 secondary managers (Matrix Org support)
  if (user.secondary_manager_ids && user.secondary_manager_ids.length >= 10) {
    throw new AppError('A user can have at most 10 secondary managers', 400, 'MAX_SECONDARY_MANAGERS_EXCEEDED');
  }

  // Check for circular reporting chain
  const wouldCreateCircular = await wouldCreateCircularChain(
    user._id.toString(),
    input.manager_id,
    req.user.company_id
  );

  if (wouldCreateCircular) {
    throw new AppError(
      'Cannot add this manager as it would create a circular reporting chain',
      400,
      'CIRCULAR_REPORTING_CHAIN'
    );
  }

  // Initialize array if it doesn't exist
  if (!user.secondary_manager_ids) {
    user.secondary_manager_ids = [];
  }

  // Check if manager is already in the array
  const managerObjectId = new Types.ObjectId(input.manager_id);
  const alreadyExists = user.secondary_manager_ids.some(
    (id: Types.ObjectId) => id.toString() === input.manager_id
  );

  if (alreadyExists) {
    throw new AppError('This manager is already assigned as a secondary manager', 400, 'DUPLICATE_SECONDARY_MANAGER');
  }

  const beforeState = user.toObject();

  // Add the manager
  user.secondary_manager_ids.push(managerObjectId);
  await user.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.secondary_manager_added',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: {
      ...user.toObject(),
      secondary_manager_added: manager._id.toString(),
    },
  });

  // Return enriched user
  const enrichedUser = await enrichUserWithManagers(user);

  res.status(200).json({
    success: true,
    data: enrichedUser,
  });
});

/**
 * DELETE /people/:id/reporting-line/secondary/:managerId
 * Removes a secondary manager from a user.
 * Produces audit event: user.secondary_manager_removed
 */
export const removeSecondaryManager = asyncHandler(async (req: Request, res: Response) => {
  const managerId: string = req.params.managerId as string;

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (!user.secondary_manager_ids || user.secondary_manager_ids.length === 0) {
    throw new AppError('No secondary managers assigned', 400, 'NO_SECONDARY_MANAGERS');
  }

  const managerObjectId = new Types.ObjectId(managerId);
  const secondaryManagerIds: Types.ObjectId[] = user.secondary_manager_ids ? [...user.secondary_manager_ids] : [];
  let managerIndex = -1;
  
  for (let i = 0; i < secondaryManagerIds.length; i++) {
    if ((secondaryManagerIds[i] as Types.ObjectId).toString() === managerId) {
      managerIndex = i;
      break;
    }
  }

  if (managerIndex === -1) {
    throw new AppError('This manager is not assigned as a secondary manager', 404, 'SECONDARY_MANAGER_NOT_FOUND');
  }

  const beforeState = user.toObject();
  const removedManagerId = (secondaryManagerIds[managerIndex] as Types.ObjectId).toString();

  // Remove the manager using MongoDB $pull operator
  await User.updateOne(
    { _id: user._id },
    { $pull: { secondary_manager_ids: managerObjectId } }
  );

  // Reload the user
  const updatedUser = await User.findOne({
    _id: user._id,
    company_id: req.user.company_id,
  });

  if (!updatedUser) {
    throw new AppError('User not found after update', 500, 'USER_NOT_FOUND_AFTER_UPDATE');
  }

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.secondary_manager_removed',
    module: 'people',
    object_type: 'User',
    object_id: updatedUser._id.toString(),
    object_label: updatedUser.full_name,
    before_state: beforeState,
    after_state: {
      ...updatedUser.toObject(),
      secondary_manager_removed: removedManagerId,
    },
  });

  // Return enriched user
  const enrichedUser = await enrichUserWithManagers(updatedUser);

  res.status(200).json({
    success: true,
    data: enrichedUser,
  });
});

/**
 * PUT /people/:id/reporting-line/primary
 * Changes the primary manager for a user.
 * Validates:
 * - Cannot assign self as manager
 * - Cannot create circular reporting chain
 * - Manager must exist in the same company
 * Produces audit event: user.primary_manager_changed
 */
export const changePrimaryManager = asyncHandler(async (req: Request, res: Response) => {
  const input = ChangePrimaryManagerSchema.parse(req.body);

  const user = await User.findOne({
    _id: req.params.id,
    company_id: req.user.company_id,
  });

  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  // If setting to null (removing primary manager)
  if (!input.manager_id) {
    const beforeState = user.toObject();
    user.manager_id = undefined;
    await user.save();

    await auditLogger.log({
      req,
      action: 'user.primary_manager_changed',
      module: 'people',
      object_type: 'User',
      object_id: user._id.toString(),
      object_label: user.full_name,
      before_state: beforeState,
      after_state: {
        ...user.toObject(),
        primary_manager_removed: true,
      },
    });

    const enrichedUser = await enrichUserWithManagers(user);
    return res.status(200).json({ success: true, data: enrichedUser });
  }

  // Validate manager exists and belongs to same company
  const manager = await User.findOne({
    _id: input.manager_id,
    company_id: req.user.company_id,
  });

  if (!manager) {
    throw new AppError('Manager not found or does not belong to this company', 404, 'MANAGER_NOT_FOUND');
  }

  // Check for self-assignment
  if (isSelfAssignment(user._id.toString(), input.manager_id)) {
    throw new AppError('Cannot assign yourself as your own manager', 400, 'SELF_ASSIGNMENT_NOT_ALLOWED');
  }

  // Check for circular reporting chain
  const wouldCreateCircular = await wouldCreateCircularChain(
    user._id.toString(),
    input.manager_id,
    req.user.company_id
  );

  if (wouldCreateCircular) {
    throw new AppError(
      'Cannot add this manager as it would create a circular reporting chain',
      400,
      'CIRCULAR_REPORTING_CHAIN'
    );
  }

  const beforeState = user.toObject();

  // Update the primary manager
  user.manager_id = new Types.ObjectId(input.manager_id);
  await user.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'user.primary_manager_changed',
    module: 'people',
    object_type: 'User',
    object_id: user._id.toString(),
    object_label: user.full_name,
    before_state: beforeState,
    after_state: {
      ...user.toObject(),
      primary_manager_changed: manager._id.toString(),
    },
  });

  // Return enriched user
  const enrichedUser = await enrichUserWithManagers(user);

  res.status(200).json({
    success: true,
    data: enrichedUser,
  });
});
