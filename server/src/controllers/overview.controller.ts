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
import { Types } from 'mongoose';

/**
 * GET /api/v1/overview/stats
 * Returns dashboard statistics: user count, department count, app count, role count
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
  ] = await Promise.all([
    User.countDocuments({ company_id: companyId }),
    User.countDocuments({ company_id: companyId, lifecycle_state: 'active', is_active: true }),
    User.countDocuments({ company_id: companyId, lifecycle_state: 'pending' }),
    Department.countDocuments({ company_id: companyId, is_active: true }),
    App.countDocuments({ company_id: companyId }),
    App.countDocuments({ company_id: companyId, is_active: true, status: 'active' }),
    Role.countDocuments({ company_id: companyId }),
    Role.countDocuments({ company_id: companyId, type: 'custom' }),
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
 * This is a dedicated endpoint for the overview page
 */
export const getOverviewInsights = asyncHandler(async (req: Request, res: Response) => {
  const companyId = req.user!.company_id;

  const insights = await Insight.find({
    company_id: companyId,
    is_resolved: false,
  })
    .lean();

  // Sort by severity (critical first) then by detected_at
  const severityOrder = { critical: 1, warning: 2, info: 3 };
  insights.sort((a, b) => {
    const orderA = severityOrder[a.severity as keyof typeof severityOrder] ?? 99;
    const orderB = severityOrder[b.severity as keyof typeof severityOrder] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
  });

  res.status(200).json({
    success: true,
    data: insights,
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
