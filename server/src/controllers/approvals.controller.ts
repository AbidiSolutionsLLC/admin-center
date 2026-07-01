import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { ApprovalRequest, ApprovalStatus } from '../models/ApprovalRequest.model';
import { UserRole } from '../models/UserRole.model';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';
import { resumeWorkflow } from '../lib/workflowEngine';
import { Types } from 'mongoose';
import { resumeWorkflow } from '../lib/workflowEngine';

const DecisionSchema = z.object({
  comments: z.string().max(1000).optional(),
});

export const getPendingApprovals = asyncHandler(async (req: Request, res: Response) => {
  // Find where the user's ID is in approver_user_ids
  const approvals = await ApprovalRequest.find({
    company_id: req.user.company_id,
    status: 'pending',
    approver_user_ids: new Types.ObjectId(req.user.userId as string)
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
  
  // Super admin bypass or strict user check
  if (!isSpecificUser && req.user.user_role !== 'super_admin') {
    throw new AppError('You do not have permission to approve this request', 403, 'FORBIDDEN');
  }

  approval.status = 'approved';
  approval.decided_by = req.user.userId as any;
  approval.decided_at = new Date();
  approval.comments = comments;
  await approval.save();

  await auditLogger.log({
    req,
    action: 'approval.granted',
    module: 'workflows',
    object_type: 'ApprovalRequest',
    object_id: approval._id.toString(),
    object_label: 'Approval Request',
    before_state: { status: 'pending' },
    after_state: approval.toObject(),
  });

  // Resume workflow engine
  await resumeWorkflow(approval.workflow_run_id.toString(), true, req.user.userId);

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
  
  if (!isSpecificUser && req.user.user_role !== 'super_admin') {
    throw new AppError('You do not have permission to reject this request', 403, 'FORBIDDEN');
  }

  approval.status = 'rejected';
  approval.decided_by = req.user.userId as any;
  approval.decided_at = new Date();
  approval.comments = comments;
  await approval.save();

  await auditLogger.log({
    req,
    action: 'approval.rejected',
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
