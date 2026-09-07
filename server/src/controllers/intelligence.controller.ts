// server/src/controllers/intelligence.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { auditLogger } from '../lib/auditLogger';
import { Insight } from '../models/Insight.model';
import { User } from '../models/User.model';
import { runIntelligenceRules } from '../lib/intelligence';
import { AppError } from '../utils/AppError';
import { sanitizeUserForAudit } from '../utils/sanitizeUserForAudit';

/**
 * GET /intelligence
 * Returns all active insights for the company, optionally filtered by module/severity/area/category.
 * Used by: Overview dashboard, module-specific intelligence banners.
 */
export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  const { module, severity, area, category, affected_object_id, search } = req.query;

  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
    is_resolved: false,
    is_dismissed: false,
  };

  const { Company } = await import('../models/Company.model');
  const company = await Company.findById(req.user.company_id).lean();
  const sensitivity = (company?.settings as any)?.insight_sensitivity || 'medium';

  // Apply sensitivity filter if specific severity wasn't requested
  if (!severity || severity === 'all') {
    if (sensitivity === 'low') {
      filter.severity = { $in: ['critical', 'high'] };
    } else if (sensitivity === 'medium') {
      filter.severity = { $in: ['critical', 'high', 'medium'] };
    }
  } else {
    filter.severity = severity;
  }

  if (category && category !== 'all') {
    filter.category = category;
  }

  if (area && area !== 'all') {
    filter.affected_area = area;
  }

  if (affected_object_id) {
    filter.affected_object_id = affected_object_id;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { title: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
      { affected_object_label: { $regex: s, $options: 'i' } },
      { reasoning: { $regex: s, $options: 'i' } },
    ];
  }

  // Note: module filtering is done via affected_object_type pattern matching or affected_area
  if (module === 'organization') {
    filter.affected_object_type = 'Department';
  } else if (module === 'people') {
    filter.affected_object_type = 'User';
  } else if (module === 'roles') {
    filter.affected_object_type = 'Role';
  } else if (module === 'workflows') {
    filter.affected_object_type = 'Workflow';
  } else if (module === 'policies') {
    filter.affected_object_type = 'PolicyVersion';
  } else if (module === 'security') {
    filter.affected_area = 'Security';
  }

  const rawInsights = await Insight.find(filter)
    .sort({ severity: 1, detected_at: -1 })
    .lean();

  // Enrich with affected_area
  const { resolveAffectedArea } = await import('./overview.controller');
  const insights = rawInsights.map((insight) => ({
    ...insight,
    affected_area: resolveAffectedArea(insight),
  }));

  // Transform severity to numeric for proper sorting (critical=1, warning=2, info=3)
  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
  insights.sort((a, b) => {
    const orderA = severityOrder[a.severity as keyof typeof severityOrder] ?? 99;
    const orderB = severityOrder[b.severity as keyof typeof severityOrder] ?? 99;
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

  await auditLogger.log({
    req,
    action: 'intelligence.executed',
    module: 'intelligence',
    object_type: 'System',
    object_id: 'run-intelligence',
    object_label: 'Intelligence rules executed',
    before_state: null,
    after_state: { trigger: 'manual', company_id: req.user.company_id },
  });

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

/**
 * PUT /intelligence/:id/dismiss
 * Marks an insight as dismissed.
 */
export const dismissInsight = asyncHandler(async (req: Request, res: Response) => {
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

  insight.is_dismissed = true;
  insight.dismissed_at = new Date();
  await insight.save();

  // Audit log
  await auditLogger.log({
    req,
    action: 'insights.dismissed',
    module: 'insights',
    object_type: 'Insight',
    object_id: insight._id.toString(),
    object_label: insight.title,
    before_state: beforeState,
    after_state: { ...insight.toObject() },
  });

  res.status(200).json({ success: true, data: insight });
});

/**
 * POST /intelligence/:id/auto-fix
 * Automatically fixes the issue if an auto-fix is available.
 */
export const executeAutoFix = asyncHandler(async (req: Request, res: Response) => {
  const insight = await Insight.findOne({
    _id: req.params.id,
    company_id: req.user!.company_id,
  });

  if (!insight) {
    throw new AppError('Insight not found', 404, 'NOT_FOUND');
  }

  if (!insight.auto_fix_available || !insight.auto_fix_action) {
    throw new AppError('No automated fix available for this insight', 400, 'NO_AUTO_FIX');
  }

  const beforeState = { ...insight.toObject() };
  const payload = insight.auto_fix_payload || {};

  switch (insight.auto_fix_action) {
    case 'ASSIGN_DEFAULT_LOCATION': {
      if (!insight.affected_object_id || !payload.location_id) {
        throw new AppError('Missing data for location fix', 400, 'INVALID_PAYLOAD');
      }
      
      const user = await User.findOne({ _id: insight.affected_object_id, company_id: req.user!.company_id });
      if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');
      
      const userBefore = sanitizeUserForAudit(user.toObject() as any);
      user.location_id = payload.location_id;
      await user.save();

      await auditLogger.log({
        req,
        action: 'user.updated',
        module: 'people',
        object_type: 'User',
        object_id: user._id.toString(),
        object_label: user.full_name,
        before_state: userBefore,
        after_state: sanitizeUserForAudit(user.toObject() as any),
      });
      break;
    }
    default:
      throw new AppError(`Unknown auto fix action: ${insight.auto_fix_action}`, 400, 'UNKNOWN_ACTION');
  }

  insight.is_resolved = true;
  insight.resolved_at = new Date();
  await insight.save();

  // Audit log for the insight resolution
  await auditLogger.log({
    req,
    action: 'insights.auto_fixed',
    module: 'insights',
    object_type: 'Insight',
    object_id: insight._id.toString(),
    object_label: insight.title,
    before_state: beforeState,
    after_state: { ...insight.toObject() },
  });

  res.status(200).json({ success: true, data: insight });
});

/**
 * GET /intelligence/history
 * Returns historical (resolved or dismissed) insights for the company.
 * Includes trend data for the frontend.
 */
export const getInsightHistory = asyncHandler(async (req: Request, res: Response) => {
  const { severity, category, status = 'all', page = '1', limit = '50', search } = req.query;

  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
    $or: [{ is_resolved: true }, { is_dismissed: true }],
  };

  if (status === 'resolved') {
    filter.is_resolved = true;
    delete filter.$or;
  } else if (status === 'dismissed') {
    filter.is_dismissed = true;
    delete filter.$or;
  }

  if (severity && severity !== 'all') {
    filter.severity = severity;
  }

  if (category && category !== 'all') {
    filter.category = category;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const s = search.trim();
    filter.$or = [
      { title: { $regex: s, $options: 'i' } },
      { description: { $regex: s, $options: 'i' } },
      { affected_object_label: { $regex: s, $options: 'i' } },
    ];
  }

  const pageNum = parseInt(page as string, 10) || 1;
  const limitNum = parseInt(limit as string, 10) || 50;
  const skip = (pageNum - 1) * limitNum;

  const [rawInsights, total] = await Promise.all([
    Insight.find(filter)
      .sort({ resolved_at: -1, dismissed_at: -1, detected_at: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Insight.countDocuments(filter),
  ]);

  // Enrich with affected_area
  const { resolveAffectedArea } = await import('./overview.controller');
  const insights = rawInsights.map((insight) => ({
    ...insight,
    affected_area: resolveAffectedArea(insight),
  }));

  // Identify Recurring Issues
  // An issue is recurring if the same title and affected_object_id have appeared multiple times.
  // This could be done with an aggregation pipeline, but for now we'll do a simple aggregation 
  // on all historical issues for this company.
  
  const allHistorical = await Insight.find({
    company_id: req.user.company_id,
    $or: [{ is_resolved: true }, { is_dismissed: true }]
  }).select('title affected_object_id resolved_at').lean();

  const recurrenceMap: Record<string, number> = {};
  allHistorical.forEach((inc) => {
    const key = `${inc.title}::${inc.affected_object_id}`;
    recurrenceMap[key] = (recurrenceMap[key] || 0) + 1;
  });

  // Attach a is_recurring flag to the paginated list
  const enrichedInsights = insights.map((insight) => {
    const key = `${insight.title}::${insight.affected_object_id}`;
    return {
      ...insight,
      is_recurring: recurrenceMap[key] > 1,
      recurrence_count: recurrenceMap[key],
    };
  });
  
  // Calculate Trends (Count by week over the last 6 months or months)
  // For simplicity, let's group by month (YYYY-MM)
  const trends: Record<string, { resolved: number; dismissed: number }> = {};
  allHistorical.forEach((inc) => {
    const date = inc.resolved_at || inc.dismissed_at || new Date();
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!trends[month]) {
      trends[month] = { resolved: 0, dismissed: 0 };
    }
    if ((inc as any).is_resolved) {
      trends[month].resolved += 1;
    } else {
      trends[month].dismissed += 1;
    }
  });

  const sortedTrends = Object.keys(trends).sort().map(key => ({
    date: key,
    ...trends[key]
  }));

  res.status(200).json({
    success: true,
    data: enrichedInsights,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    },
    trends: sortedTrends,
  });
});
