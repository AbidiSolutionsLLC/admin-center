// server/src/routes/notifications.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getTemplates,
  getSupportedVariables,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  testTemplate,
  getInAppNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getDeliveryEvents,
} from '../controllers/notifications.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// ── Template Management ─────────────────────────────────────────────

/**
 * GET /notifications/templates
 * List all notification templates
 */
router.get('/templates', getTemplates);

/**
 * GET /notifications/templates/variables
 * Get supported variable tokens
 */
router.get('/templates/variables', getSupportedVariables);

/**
 * GET /notifications/templates/:id
 * Get a single template
 */
router.get('/templates/:id', getTemplateById);

/**
 * POST /notifications/templates
 * Create a new template
 */
router.post('/templates', requireRole(['super_admin', 'ops_admin']), createTemplate);

/**
 * PUT /notifications/templates/:id
 * Update a template
 */
router.put('/templates/:id', requireRole(['super_admin', 'ops_admin']), updateTemplate);

/**
 * DELETE /notifications/templates/:id
 * Soft-delete a template
 */
router.delete('/templates/:id', requireRole(['super_admin']), deleteTemplate);

/**
 * POST /notifications/templates/:id/test
 * Test variable substitution (no actual email sent)
 */
router.post('/templates/:id/test', requireRole(['super_admin', 'ops_admin']), testTemplate);

// ── In-App Notifications ────────────────────────────────────────────

/**
 * GET /notifications/in-app
 * Get user's in-app notifications
 */
router.get('/in-app', getInAppNotifications);

/**
 * GET /notifications/in-app/unread-count
 * Get unread notification count (for TopBar bell)
 */
router.get('/in-app/unread-count', getUnreadCount);

/**
 * POST /notifications/in-app/:id/read
 * Mark a notification as read
 */
router.post('/in-app/:id/read', markAsRead);

/**
 * POST /notifications/in-app/mark-all-read
 * Mark all as read
 */
router.post('/in-app/mark-all-read', markAllAsRead);

// ── Delivery Log (read-only) ────────────────────────────────────────

/**
 * GET /notifications/events
 * Get delivery event log
 */
router.get('/events', requireRole(['super_admin', 'ops_admin']), getDeliveryEvents);

export default router;
