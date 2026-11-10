import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { IpRestriction, Company } from '../models';
import { AppError } from '../utils/AppError';
import { auditLogger } from '../lib/auditLogger';

/**
 * GET /api/v1/security/ip-restrictions
 * Get all IP restrictions for the current company
 */
export const getIpRestrictions = asyncHandler(async (req: Request, res: Response) => {
  const restrictions = await IpRestriction.find({ company_id: req.user.company_id }).sort({ created_at: -1 });
  res.status(200).json({ success: true, data: restrictions });
});

/**
 * POST /api/v1/security/ip-restrictions
 * Create a new IP restriction rule
 */
export const createIpRestriction = asyncHandler(async (req: Request, res: Response) => {
  const { label, ip_address, target_type, target_id, is_enabled, subject_type, subject_id, subject_label } = req.body;

  if (!label || !ip_address || !target_type) {
    throw new AppError('Label, IP address, and target type are required', 400, 'BAD_REQUEST');
  }

  const { isValidIpOrCidr } = require('../utils/ipUtils');
  if (!isValidIpOrCidr(ip_address)) {
    throw new AppError('Invalid IP address or CIDR notation', 400, 'BAD_REQUEST');
  }

  const s_type = subject_type || 'all_users';
  if (s_type !== 'all_users' && !subject_id) {
    throw new AppError('subject_id is required when subject_type is not all_users', 400, 'BAD_REQUEST');
  }
  if (s_type === 'all_users' && subject_id) {
    throw new AppError('subject_id must be null when subject_type is all_users', 400, 'BAD_REQUEST');
  }

  const restriction = await IpRestriction.create({
    company_id: req.user.company_id,
    label,
    ip_address,
    target_type,
    target_id: target_type === 'app' ? target_id : undefined,
    subject_type: s_type,
    subject_id: s_type !== 'all_users' ? subject_id : undefined,
    subject_label: s_type !== 'all_users' ? subject_label : undefined,
    is_enabled: is_enabled !== undefined ? is_enabled : true,
  });

  await auditLogger.log({
    req,
    action: 'ip_restriction.created',
    module: 'security',
    object_type: 'IpRestriction',
    object_id: restriction._id.toString(),
    object_label: restriction.label,
    before_state: null,
    after_state: restriction.toObject(),
  });

  res.status(201).json({ success: true, data: restriction });
});

/**
 * PUT /api/v1/security/ip-restrictions/:id
 * Update an existing IP restriction rule
 */
export const updateIpRestriction = asyncHandler(async (req: Request, res: Response) => {
  const { label, ip_address, target_type, target_id, is_enabled, subject_type, subject_id, subject_label } = req.body;
  
  const restriction = await IpRestriction.findOne({ _id: req.params.id, company_id: req.user.company_id });
  if (!restriction) {
    throw new AppError('IP Restriction not found', 404, 'NOT_FOUND');
  }

  const before_state = restriction.toObject();

  const { isValidIpOrCidr } = require('../utils/ipUtils');
  if (ip_address !== undefined && !isValidIpOrCidr(ip_address)) {
    throw new AppError('Invalid IP address or CIDR notation', 400, 'BAD_REQUEST');
  }

  if (label !== undefined) restriction.label = label;
  if (ip_address !== undefined) restriction.ip_address = ip_address;
  if (target_type !== undefined) restriction.target_type = target_type;
  if (target_type === 'app' && target_id !== undefined) restriction.target_id = target_id;
  if (target_type !== 'app') restriction.target_id = undefined;
  if (is_enabled !== undefined) restriction.is_enabled = is_enabled;

  if (subject_type !== undefined) {
    if (subject_type !== 'all_users' && !subject_id && restriction.subject_type === 'all_users') {
      throw new AppError('subject_id is required when subject_type is not all_users', 400, 'BAD_REQUEST');
    }
    if (subject_type === 'all_users' && subject_id) {
      throw new AppError('subject_id must be null when subject_type is all_users', 400, 'BAD_REQUEST');
    }
    restriction.subject_type = subject_type;
    
    if (subject_type === 'all_users') {
      restriction.subject_id = undefined;
      restriction.subject_label = undefined;
    } else {
      if (subject_id !== undefined) restriction.subject_id = subject_id;
      if (subject_label !== undefined) restriction.subject_label = subject_label;
    }
  } else if (subject_id !== undefined || subject_label !== undefined) {
     if (restriction.subject_type === 'all_users') {
         throw new AppError('subject_id must be null when subject_type is all_users', 400, 'BAD_REQUEST');
     }
     if (subject_id !== undefined) restriction.subject_id = subject_id;
     if (subject_label !== undefined) restriction.subject_label = subject_label;
  }

  await restriction.save();

  await auditLogger.log({
    req,
    action: 'ip_restriction.updated',
    module: 'security',
    object_type: 'IpRestriction',
    object_id: restriction._id.toString(),
    object_label: restriction.label,
    before_state,
    after_state: restriction.toObject(),
  });

  res.status(200).json({ success: true, data: restriction });
});

/**
 * DELETE /api/v1/security/ip-restrictions/:id
 * Delete an IP restriction rule
 */
export const deleteIpRestriction = asyncHandler(async (req: Request, res: Response) => {
  const restriction = await IpRestriction.findOne({ _id: req.params.id, company_id: req.user.company_id });
  if (!restriction) {
    throw new AppError('IP Restriction not found', 404, 'NOT_FOUND');
  }

  await IpRestriction.deleteOne({ _id: restriction._id });

  await auditLogger.log({
    req,
    action: 'ip_restriction.deleted',
    module: 'security',
    object_type: 'IpRestriction',
    object_id: restriction._id.toString(),
    object_label: restriction.label,
    before_state: restriction.toObject(),
    after_state: null,
  });

  res.status(200).json({ success: true, message: 'IP Restriction deleted successfully' });
});

/**
 * PUT /api/v1/security/ip-restrictions/global-toggle
 * Toggle global IP restrictions
 */
export const toggleGlobalIpRestrictions = asyncHandler(async (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    throw new AppError('enabled must be a boolean', 400, 'BAD_REQUEST');
  }

  const company = await Company.findById(req.user.company_id);
  if (!company) {
    throw new AppError('Company not found', 404, 'NOT_FOUND');
  }

  const before_state = { ip_restrictions_enabled: company.settings.ip_restrictions_enabled };
  
  company.settings.ip_restrictions_enabled = enabled;
  await company.save();

  await auditLogger.log({
    req,
    action: 'security.global_ip_restrictions_toggled',
    module: 'security',
    object_type: 'Company',
    object_id: company._id.toString(),
    object_label: company.name,
    before_state,
    after_state: { ip_restrictions_enabled: enabled },
  });

  res.status(200).json({ success: true, data: { ip_restrictions_enabled: enabled } });
});

/**
 * GET /api/v1/security/ip-restrictions/global-status
 * Get the current status of global IP restrictions
 */
export const getGlobalIpRestrictionsStatus = asyncHandler(async (req: Request, res: Response) => {
  const company = await Company.findById(req.user.company_id).select('settings.ip_restrictions_enabled');
  res.status(200).json({ success: true, data: { ip_restrictions_enabled: company?.settings?.ip_restrictions_enabled || false } });
});
