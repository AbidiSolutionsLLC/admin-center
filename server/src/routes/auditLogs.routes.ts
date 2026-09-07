// server/src/routes/auditLogs.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {

  getAuditEvents,
  getAuditEventDetail,
  exportAuditLogCSV,
  exportAuditLogJSON,
  verifyAuditLogs,
  streamAuditEvents,
} from '../controllers/auditLogs.controller';

const router = Router();

// All audit log routes require authentication
router.use(requireAuth);

// Require appropriate roles for audit logs (Super Admin or IT Admin)
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
router.use(requireRole([ROLES.SUPER_ADMIN, ROLES.IT_ADMIN]));

// Get audit events with pagination and filters
router.get('/', getAuditEvents);

// Stream audit events (SSE) (must be before /:id)
router.get('/stream', streamAuditEvents);

// Export to CSV/JSON (must be before /:id route to avoid conflict)
router.get('/export/csv', exportAuditLogCSV);
router.get('/export/json', exportAuditLogJSON);

// Verify audit log integrity
router.post('/verify', verifyAuditLogs);

// Get single audit event detail
router.get('/:id', getAuditEventDetail);

export default router;
