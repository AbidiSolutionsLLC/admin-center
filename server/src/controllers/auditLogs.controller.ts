// server/src/controllers/auditLogs.controller.ts
/**
 * Audit Logs Controller
 * Handles fetching audit events and exporting to CSV.
 * Used on: AuditLogsPage
 */
import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuditEvent } from '../models/AuditEvent.model';
import { User } from '../models/User.model';
import { auditLogger } from '../lib/auditLogger';
import { AppError } from '../utils/AppError';
import { escapeRegExp } from '../utils/regex';

/**
 * GET /api/v1/audit-logs
 * Returns audit events for the current company with pagination and filters.
 * Query params: page, limit, module, action, search, actor_email, date_from, date_to
 */
export const getAuditEvents = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
  };

  // Filter by module
  if (req.query.module) {
    filter.module = req.query.module;
  }

  // Filter by action
  if (req.query.action) {
    filter.action = req.query.action;
  }

  // Filter by actor email
  if (req.query.actor_email) {
    filter.actor_email = new RegExp(escapeRegExp(req.query.actor_email as string), 'i');
  }

  // Search in object_label, action, or actor_email
  if (req.query.search) {
    const searchRegex = new RegExp(escapeRegExp(req.query.search as string), 'i');
    filter.$or = [
      { object_label: searchRegex },
      { action: searchRegex },
      { actor_email: searchRegex },
      { object_type: searchRegex },
    ];
  }

  // Date range filter
  if (req.query.date_from || req.query.date_to) {
    filter.created_at = {};
    if (req.query.date_from) {
      const fromDate = new Date(req.query.date_from as string);
      if (isNaN(fromDate.getTime())) throw new AppError('Invalid date_from format', 400, 'INVALID_DATE');
      (filter.created_at as Record<string, unknown>).$gte = fromDate;
    }
    if (req.query.date_to) {
      const toDate = new Date(req.query.date_to as string);
      if (isNaN(toDate.getTime())) throw new AppError('Invalid date_to format', 400, 'INVALID_DATE');
      (filter.created_at as Record<string, unknown>).$lte = toDate;
    }
  }

  const [events, total] = await Promise.all([
    AuditEvent.find(filter)
      .populate('actor_id', 'full_name email')
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit),
    AuditEvent.countDocuments(filter),
  ]);

  // Enrich events with actor name if populated
  const enrichedEvents = events.map((event) => {
    const obj = event.toObject();
    const actor = obj.actor_id as unknown as { full_name?: string; email?: string } | null;
    return {
      ...obj,
      actor_name: actor?.full_name || obj.actor_email,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      events: enrichedEvents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * GET /api/v1/audit-logs/:id
 * Returns a single audit event with full before/after state.
 */
export const getAuditEventDetail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const event = await AuditEvent.findOne({
    _id: id,
    company_id: req.user.company_id,
  }).populate('actor_id', 'full_name email');

  if (!event) {
    throw new AppError('Audit event not found', 404, 'NOT_FOUND');
  }

  const obj = event.toObject();
  const actor = obj.actor_id as unknown as { full_name?: string; email?: string } | null;

  res.status(200).json({
    success: true,
    data: {
      ...obj,
      actor_name: actor?.full_name || obj.actor_email,
    },
  });
});

/**
 * GET /api/v1/audit-logs/export/csv
 * Exports all audit events (with current filters) to CSV.
 * Handles 1000+ rows efficiently by streaming.
 * Query params: same as getAuditEvents (no pagination)
 */
export const exportAuditLogCSV = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {
    company_id: req.user.company_id,
  };

  // Apply same filters as the main query
  if (req.query.module) {
    filter.module = req.query.module;
  }

  if (req.query.action) {
    filter.action = req.query.action;
  }

  if (req.query.actor_email) {
    filter.actor_email = new RegExp(escapeRegExp(req.query.actor_email as string), 'i');
  }

  if (req.query.search) {
    const searchRegex = new RegExp(escapeRegExp(req.query.search as string), 'i');
    filter.$or = [
      { object_label: searchRegex },
      { action: searchRegex },
      { actor_email: searchRegex },
      { object_type: searchRegex },
    ];
  }

  if (req.query.date_from || req.query.date_to) {
    filter.created_at = {};
    if (req.query.date_from) {
      const fromDate = new Date(req.query.date_from as string);
      if (isNaN(fromDate.getTime())) throw new AppError('Invalid date_from format', 400, 'INVALID_DATE');
      (filter.created_at as Record<string, unknown>).$gte = fromDate;
    }
    if (req.query.date_to) {
      const toDate = new Date(req.query.date_to as string);
      if (isNaN(toDate.getTime())) throw new AppError('Invalid date_to format', 400, 'INVALID_DATE');
      (filter.created_at as Record<string, unknown>).$lte = toDate;
    }
  }

  // Hard cap to prevent OOM on large datasets (DoS prevention)
  const EXPORT_HARD_LIMIT = 50_000;
  const exportCount = await AuditEvent.countDocuments(filter);
  if (exportCount > EXPORT_HARD_LIMIT) {
    throw new AppError(
      `Export exceeds the maximum allowed size of ${EXPORT_HARD_LIMIT.toLocaleString()} rows. Please narrow your filters (date range, module, etc.) and try again.`,
      413,
      'EXPORT_TOO_LARGE'
    );
  }

  // Fetch all events matching the filter (within the cap)
  const events = await AuditEvent.find(filter)
    .populate('actor_id', 'full_name email')
    .sort({ created_at: -1 })
    .lean();

  // Build CSV content
  const csvHeaders = [
    'Timestamp',
    'Actor',
    'Actor Email',
    'Action',
    'Module',
    'Object Type',
    'Object Label',
    'Object ID',
    'IP Address',
    'Before State',
    'After State',
  ];

  const escapeCsvField = (field: unknown): string => {
    if (field === null || field === undefined) return '';
    const str = typeof field === 'string' ? field : JSON.stringify(field);
    // Escape quotes and wrap in quotes if contains comma or quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = events.map((event) => {
    const actor = event.actor_id as unknown as { full_name?: string; email?: string } | null;
    return [
      new Date(event.created_at).toISOString(),
      escapeCsvField(actor?.full_name || event.actor_email),
      escapeCsvField(event.actor_email),
      escapeCsvField(event.action),
      escapeCsvField(event.module),
      escapeCsvField(event.object_type),
      escapeCsvField(event.object_label),
      escapeCsvField(event.object_id),
      escapeCsvField(event.ip_address || ''),
      escapeCsvField(event.before_state || null),
      escapeCsvField(event.after_state || null),
    ].join(',');
  });

  const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

  // Log the export action in audit log
  await auditLogger.log({
    req,
    action: 'audit_log.exported',
    module: 'audit_logs',
    object_type: 'AuditLog',
    object_id: 'export',
    object_label: `Audit log export (${events.length} rows)`,
    before_state: null,
    after_state: {
      row_count: events.length,
      filters: {
        module: req.query.module,
        action: req.query.action,
        search: req.query.search,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
      },
    },
  });

  // Send CSV file
  const filename = `audit-log-export-${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});
