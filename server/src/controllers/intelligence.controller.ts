// server/src/controllers/intelligence.controller.ts
import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { auditLogger } from '../lib/auditLogger';
import { Insight } from '../models/Insight.model';
import { runIntelligenceRules } from '../lib/intelligence';

/**
 * GET /intelligence
 * Returns all active insights for the company, optionally filtered by module/severity.
 * Used by: Overview dashboard, module-specific intelligence banners.
 */
export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  const { module, severity, affected_object_id } = req.query;

  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
    is_resolved: false,
  };

  if (severity) {
    filter.severity = severity;
  }

  if (affected_object_id) {
    filter.affected_object_id = affected_object_id;
  }

  // Note: module filtering is done via affected_object_type pattern matching
  // e.g., module="organization" → affected_object_type="Department"
  if (module === 'organization') {
    filter.affected_object_type = 'Department';
  } else if (module === 'people') {
    filter.affected_object_type = 'User';
  } else if (module === 'roles') {
    filter.affected_object_type = 'Role';
  }

  const insights = await Insight.find(filter)
    .sort({ severity: 1, detected_at: -1 }) // critical first, then by newest
    .lean();

  // Transform severity to numeric for proper sorting (critical=1, warning=2, info=3)
  const severityOrder = { critical: 1, warning: 2, info: 3 };
  insights.sort((a, b) => {
    const orderA = severityOrder[a.severity as keyof typeof severityOrder];
    const orderB = severityOrder[b.severity as keyof typeof severityOrder];
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
  });

  res.status(200).json({ success: true, data: insights });
});

/**
 * POST /intelligence/run
 * Manually triggers the intelligence rule runner for the company.
 * Used for: on-demand refresh, testing, debugging.
 */
export const runIntelligence = asyncHandler(async (req: Request, res: Response) => {
  await runIntelligenceRules(req.user.company_id);
  
  res.status(200).json({ 
    success: true, 
    message: 'Intelligence rules executed successfully' 
  });
});

/**
 * PUT /intelligence/:id/resolve
 * Marks an insight as resolved.
 */
export const resolveInsight = asyncHandler(async (req: Request, res: Response) => {
  const insight = await Insight.findOne({
    _id: req.params.id,
    company_id: req.user!.company_id,
  });

  if (!insight) {
    return res.status(404).json({
      success: false,
      error: 'Insight not found',
      code: 'NOT_FOUND'
    });
  }

  const beforeState = { ...insight.toObject() };

  insight.is_resolved = true;
  insight.resolved_at = new Date();
  await insight.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'insights.resolved',
    module: 'insights',
    object_type: 'Insight',
    object_id: insight._id.toString(),
    object_label: insight.title,
    before_state: beforeState,
    after_state: { ...insight.toObject() },
  });

  res.status(200).json({ success: true, data: insight });
});
