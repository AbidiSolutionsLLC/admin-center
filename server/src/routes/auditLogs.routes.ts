// server/src/routes/auditLogs.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getAuditEvents,
  getAuditEventDetail,
  exportAuditLogCSV,
} from '../controllers/auditLogs.controller';

const router = Router();

// All audit log routes require authentication and IT Admin/Super Admin role
router.use(requireAuth);
router.use(requireRole(PERMISSION_GROUPS.IT_ADMINS));

// Get audit events with pagination and filters
router.get('/', getAuditEvents);

// Export to CSV (must be before /:id route to avoid conflict)
router.get('/export/csv', exportAuditLogCSV);

// Get single audit event detail
router.get('/:id', getAuditEventDetail);

export default router;
