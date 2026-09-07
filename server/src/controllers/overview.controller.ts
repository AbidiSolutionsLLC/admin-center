// server/src/controllers/overview.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { User } from '../models/User.model';
import { Department } from '../models/Department.model';
import { App } from '../models/App.model';
import { Role } from '../models/Role.model';
import { AuditEvent } from '../models/AuditEvent.model';
import { Insight } from '../models/Insight.model';
import { Company } from '../models/Company.model';

/**
 * Resolves or standardizes the affected_area of an insight.
 * Ensures consistent areas: Identity, Access, Workflow, Organization, Security, Configuration.
 */
export function resolveAffectedArea(insight: {
  affected_area?: string;
  affected_object_type?: string;
  title?: string;
  category?: string;
}): string {
  if (insight.affected_area && insight.affected_area !== 'General') {
    return insight.affected_area;
  }
  const title = (insight.title || '').toLowerCase();
  const objType = (insight.affected_object_type || '').toLowerCase();

  if (title.includes('mfa') || title.includes('security') || title.includes('risky') || title.includes('suspicious') || objType.includes('security')) {
    return 'Security';
  }
  if (title.includes('workflow') || objType.includes('workflow')) {
    return 'Workflow';
  }
  if (title.includes('permission') || title.includes('role') || objType === 'role') {
    return 'Access';
  }
  if (title.includes('department') || title.includes('team') || title.includes('business unit') || objType === 'department' || objType === 'team') {
    return 'Organization';
  }
  if (title.includes('policy') || title.includes('location') || title.includes('calendar') || title.includes('schedule') || title.includes('setup') || title.includes('configuration') || objType === 'company' || objType === 'location' || objType.includes('policy')) {
    return 'Configuration';
  }
  if (objType === 'user' || objType === 'employee') {
    return 'Identity';
  }
  return 'Identity';
}

/**
 * GET /api/v1/overview/stats
 * Returns dashboard statistics: user count, department count, app count, role count, open insights
 */
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  // Parallel count queries
  const [
    totalUsers,
    activeUsers,
    invitedUsers,
    totalDepartments,
    totalApps,
    activeApps,
    totalRoles,
    customRoles,
    totalInsights,
    criticalInsights,
    highInsights,
    mediumInsights,
    lowInsights,
  ] = await Promise.all([
    User.countDocuments({ company_id: companyId }),
    User.countDocuments({ company_id: companyId, lifecycle_state: 'active', is_active: true }),
    User.countDocuments({ company_id: companyId, lifecycle_state: 'invited' }),
    Department.countDocuments({ company_id: companyId, is_active: true }),
    App.countDocuments({ company_id: companyId }),
    App.countDocuments({ company_id: companyId, is_active: true, status: 'active' }),
    Role.countDocuments({ company_id: companyId }),
    Role.countDocuments({ company_id: companyId, type: 'custom' }),
    Insight.countDocuments({ company_id: companyId, is_resolved: false, is_dismissed: false }),
    Insight.countDocuments({ company_id: companyId, is_resolved: false, is_dismissed: false, severity: 'critical' }),
    Insight.countDocuments({ company_id: companyId, is_resolved: false, is_dismissed: false, severity: 'high' }),
    Insight.countDocuments({ company_id: companyId, is_resolved: false, is_dismissed: false, severity: 'medium' }),
    Insight.countDocuments({ company_id: companyId, is_resolved: false, is_dismissed: false, severity: 'low' }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        active: activeUsers,
        invited: invitedUsers,
      },
      departments: {
        total: totalDepartments,
      },
      apps: {
        total: totalApps,
        active: activeApps,
      },
      roles: {
        total: totalRoles,
        custom: customRoles,
      },
      insights: {
        total: totalInsights,
        critical: criticalInsights,
        high: highInsights,
        medium: mediumInsights,
        low: lowInsights,
      },
    },
  });
});

/**
 * GET /api/v1/overview/setup-progress
 * Calculates setup completion percentage across all modules
 */
export const getSetupProgress = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  // Get company
  const company = await Company.findById(companyId).lean();
  if (!company) {
    throw new AppError('Company not found', 404, 'COMPANY_NOT_FOUND');
  }

  // Calculate progress for each module
  const modules = [
    {
      key: 'organization',
      label: 'Organization',
      checks: [
        { key: 'has_departments', check: async () => (await Department.countDocuments({ company_id: companyId, is_active: true })) > 0 },
      ],
    },
    {
      key: 'people',
      label: 'People',
      checks: [
        { key: 'has_users', check: async () => (await User.countDocuments({ company_id: companyId, is_active: true })) > 0 },
        { key: 'has_active_users', check: async () => (await User.countDocuments({ company_id: companyId, lifecycle_state: 'active', is_active: true })) > 0 },
      ],
    },
    {
      key: 'roles',
      label: 'Roles & Access',
      checks: [
        { key: 'has_roles', check: async () => (await Role.countDocuments({ company_id: companyId })) > 0 },
      ],
    },
    {
      key: 'apps',
      label: 'App Assignment',
      checks: [
        { key: 'has_apps', check: async () => (await App.countDocuments({ company_id: companyId })) > 0 },
      ],
    },
  ];

  const progress: Array<{ key: string; label: string; completed: number; total: number; percentage: number }> = [];
  let totalChecks = 0;
  let completedChecks = 0;

  for (const module of modules) {
    const results = await Promise.all(module.checks.map((c) => c.check()));
    const completed = results.filter(Boolean).length;
    const total = module.checks.length;
    const percentage = Math.round((completed / total) * 100);

    progress.push({
      key: module.key,
      label: module.label,
      completed,
      total,
      percentage,
    });

    totalChecks += total;
    completedChecks += completed;
  }

  const overallPercentage = Math.round((completedChecks / totalChecks) * 100);

  res.status(200).json({
    success: true,
    data: {
      overall_percentage: overallPercentage,
      modules: progress,
      total_checks: totalChecks,
      completed_checks: completedChecks,
    },
  });
});

/**
 * GET /api/v1/overview/recent-activity
 * Returns last 10 audit events with actor and action details
 */
export const getRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const events = await AuditEvent.find({ company_id: companyId })
    .sort({ created_at: -1 })
    .limit(10)
    .lean();

  // Enrich with user info if needed (actor_email is already in the event)
  const enrichedEvents = events.map((event) => ({
    ...event,
    time_ago: getTimeAgo(event.created_at),
  }));

  res.status(200).json({
    success: true,
    data: enrichedEvents,
  });
});

/**
 * GET /api/v1/overview/insights
 * Returns active insights sorted by severity (critical first)
 * Supports filtering by severity, area, category, and search query
 */
export const getOverviewInsights = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;
  const { severity, area, category, search } = req.query;

  const filter: Record<string, unknown> = {
    company_id: companyId,
    is_resolved: false,
    is_dismissed: false,
  };

  if (severity && severity !== 'all') {
    filter.severity = severity;
  }

  if (category && category !== 'all') {
    filter.category = category;
  }

  if (area && area !== 'all') {
    filter.affected_area = area;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { affected_object_label: searchRegex },
      { reasoning: searchRegex },
    ];
  }

  const rawInsights = await Insight.find(filter).lean();

  // Enrich with affected_area if not set
  const enrichedInsights = rawInsights.map((insight) => ({
    ...insight,
    affected_area: resolveAffectedArea(insight),
  }));

  // Sort by severity (critical first) then by detected_at
  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };
  enrichedInsights.sort((a, b) => {
    const orderA = severityOrder[a.severity as keyof typeof severityOrder] ?? 99;
    const orderB = severityOrder[b.severity as keyof typeof severityOrder] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
  });

  // Calculate summary counts across all active insights for the company
  const allCompanyInsights = await Insight.find({ company_id: companyId, is_resolved: false, is_dismissed: false }).lean();
  const counts = {
    total: allCompanyInsights.length,
    critical: allCompanyInsights.filter((i) => i.severity === 'critical').length,
    high: allCompanyInsights.filter((i) => i.severity === 'high').length,
    medium: allCompanyInsights.filter((i) => i.severity === 'medium').length,
    low: allCompanyInsights.filter((i) => i.severity === 'low').length,
    misconfiguration: allCompanyInsights.filter((i) => i.category === 'misconfiguration').length,
    health: allCompanyInsights.filter((i) => i.category === 'health').length,
  };

  const areaCounts: Record<string, number> = {};
  for (const ins of allCompanyInsights) {
    const a = resolveAffectedArea(ins);
    areaCounts[a] = (areaCounts[a] || 0) + 1;
  }

  res.status(200).json({
    success: true,
    data: enrichedInsights,
    summary: {
      counts,
      area_counts: areaCounts,
    },
  });
});

/**
 * Helper function to calculate time ago
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return then.toLocaleDateString();
}
