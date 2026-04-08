// server/src/routes/auditLogs.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getAuditEvents,
  getAuditEventDetail,
  exportAuditLogCSV,
} from '../controllers/auditLogs.controller';

const router = Router();

// All audit log routes require authentication
router.use(requireAuth);

// Get audit events with pagination and filters
router.get('/', getAuditEvents);

// Get single audit event detail
router.get('/:id', getAuditEventDetail);

// Export to CSV (must be before /:id route to avoid conflict)
router.get('/export/csv', exportAuditLogCSV);

export default router;
