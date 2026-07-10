import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ApprovalRequest, ApprovalStatus } from '../models/ApprovalRequest.model';
import { UserRole } from '../models/UserRole.model';
import { User } from '../models/User.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { resumeWorkflow } from '../lib/workflowEngine';
import { Types } from 'mongoose';

const DecisionSchema = z.object({
  comments: z.string().max(1000).optional(),
});

export const getPendingApprovals = asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const delegatedForUsers = await User.find({
    company_id: req.user.company_id,
    delegates: {
      $elemMatch: {
        user_id: new Types.ObjectId(req.user.userId as string),
        start_date: { $lte: now },
        end_date: { $gte: now }
      }
    }
  }).select('_id');
  
  const targetUserIds = [
    new Types.ObjectId(req.user.userId as string),
    ...delegatedForUsers.map(u => u._id)
  ];

  // Find where the user's ID (or their delegated users' IDs) is in approver_user_ids
  const approvals = await ApprovalRequest.find({
    company_id: req.user.company_id,
    status: 'pending',
    approver_user_ids: { $in: targetUserIds }
  })
    .populate('workflow_run_id')
    .populate('workflow_step_id')
    .sort({ created_at: -1 });

  res.status(200).json({ success: true, data: approvals });
});

export const approveRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { comments } = DecisionSchema.parse(req.body);

  const approval = await ApprovalRequest.findOne({
    _id: id,
    company_id: req.user.company_id,
    status: 'pending'
  });

  if (!approval) {
    throw new AppError('Approval request not found or already decided', 404, 'NOT_FOUND');
  }

  // Check if user has permission to approve (is specific user)
  const isSpecificUser = approval.approver_user_ids.some(id => id.toString() === req.user.userId.toString());
  
  let actedAsDelegateFor: Types.ObjectId | undefined = undefined;

  // Super admin bypass or strict user check
  if (!isSpecificUser && req.user.user_role !== 'super_admin') {
    const now = new Date();
    const delegatedForUsers = await User.find({
      _id: { $in: approval.approver_user_ids },
      delegates: {
        $elemMatch: {
          user_id: new Types.ObjectId(req.user.userId as string),
          start_date: { $lte: now },
          end_date: { $gte: now }
        }
      }
    });

    if (delegatedForUsers.length === 0) {
      throw new AppError('You do not have permission to approve this request', 403, 'FORBIDDEN');
    }
    actedAsDelegateFor = delegatedForUsers[0]._id;
  }

  // Check if already decided by this user
  const alreadyDecided = approval.decisions.some(
    d => d.user_id.toString() === req.user.userId.toString() || 
         (actedAsDelegateFor && d.user_id.toString() === actedAsDelegateFor.toString())
  );
  if (alreadyDecided) {
    throw new AppError('You have already provided a decision for this request', 400, 'BAD_REQUEST');
  }

  approval.decisions.push({
    user_id: req.user.userId as any,
    status: 'approved',
    delegated_for: actedAsDelegateFor as any,
    comments,
    decided_at: new Date()
  });

  const condition = approval.approval_condition || 'any';
  let finalStatus: 'pending' | 'approved' | 'rejected' = 'pending';

  if (condition === 'any') {
    finalStatus = 'approved';
  } else if (condition === 'all') {
    const approvedCount = approval.decisions.filter(d => d.status === 'approved').length;
    if (approvedCount >= approval.approver_user_ids.length) {
      finalStatus = 'approved';
    }
  }

  if (finalStatus !== 'pending') {
    approval.status = finalStatus;
    approval.decided_by = req.user.userId as any;
    approval.delegated_for = actedAsDelegateFor as any;
    approval.decided_at = new Date();
    approval.comments = comments;
    await approval.save();

    await auditLogger.log({
      req,
      action: actedAsDelegateFor ? 'approval.granted_via_delegation' : 'approval.granted',
      module: 'workflows',
      object_type: 'ApprovalRequest',
      object_id: approval._id.toString(),
      object_label: 'Approval Request',
      before_state: { status: 'pending' },
      after_state: approval.toObject(),
    });

    // Resume workflow engine
    await resumeWorkflow(approval.workflow_run_id.toString(), true, req.user.userId);
  } else {
    await approval.save();
    await auditLogger.log({
      req,
      action: 'approval.decision_recorded',
      module: 'workflows',
      object_type: 'ApprovalRequest',
      object_id: approval._id.toString(),
      object_label: 'Approval Request',
      before_state: { status: 'pending' },
      after_state: approval.toObject(),
    });
  }

  res.status(200).json({ success: true, data: approval });
});

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { comments } = DecisionSchema.parse(req.body);

  const approval = await ApprovalRequest.findOne({
    _id: id,
    company_id: req.user.company_id,
    status: 'pending'
  });

  if (!approval) {
    throw new AppError('Approval request not found or already decided', 404, 'NOT_FOUND');
  }

  // Check if user has permission to reject (is specific user)
  const isSpecificUser = approval.approver_user_ids.some(id => id.toString() === req.user.userId.toString());
  
  let actedAsDelegateFor: Types.ObjectId | undefined = undefined;

  if (!isSpecificUser && req.user.user_role !== 'super_admin') {
    const now = new Date();
    const delegatedForUsers = await User.find({
      _id: { $in: approval.approver_user_ids },
      delegates: {
        $elemMatch: {
          user_id: new Types.ObjectId(req.user.userId as string),
          start_date: { $lte: now },
          end_date: { $gte: now }
        }
      }
    });

    if (delegatedForUsers.length === 0) {
      throw new AppError('You do not have permission to reject this request', 403, 'FORBIDDEN');
    }
    actedAsDelegateFor = delegatedForUsers[0]._id;
  }

  // Check if already decided by this user
  const alreadyDecided = approval.decisions.some(
    d => d.user_id.toString() === req.user.userId.toString() || 
         (actedAsDelegateFor && d.user_id.toString() === actedAsDelegateFor.toString())
  );
  if (alreadyDecided) {
    throw new AppError('You have already provided a decision for this request', 400, 'BAD_REQUEST');
  }

  approval.decisions.push({
    user_id: req.user.userId as any,
    status: 'rejected',
    delegated_for: actedAsDelegateFor as any,
    comments,
    decided_at: new Date()
  });

  // If ANY person rejects, the whole request is rejected, regardless of 'any' or 'all' condition
  const finalStatus = 'rejected';

  approval.status = finalStatus;
  approval.decided_by = req.user.userId as any;
  approval.delegated_for = actedAsDelegateFor as any;
  approval.decided_at = new Date();
  approval.comments = comments;
  await approval.save();

  await auditLogger.log({
    req,
    action: actedAsDelegateFor ? 'approval.rejected_via_delegation' : 'approval.rejected',
    module: 'workflows',
    object_type: 'ApprovalRequest',
    object_id: approval._id.toString(),
    object_label: 'Approval Request',
    before_state: { status: 'pending' },
    after_state: approval.toObject(),
  });

  // Resume workflow engine with failure
  await resumeWorkflow(approval.workflow_run_id.toString(), false, req.user.userId);

  res.status(200).json({ success: true, data: approval });
});
