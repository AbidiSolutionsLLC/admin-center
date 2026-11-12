// server/src/routes/auditLogs.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
import {

  getAuditEvents,
  getAuditEventDetail,
  exportAuditLogCSV,
  exportAuditLogJSON,
  verifyAuditLogs,
  streamAuditEvents,
} from '../controllers/auditLogs.controller';

const router = Router();

// Stream audit events (SSE) — accepts single-use ?ticket= or fallback header auth
router.get('/stream', async (req, res, next) => {
  if (req.query.ticket) {
    return streamAuditEvents(req, res);
  }
  return requireAuth(req, res, () => {
    return requireRole([ROLES.SUPER_ADMIN, ROLES.IT_ADMIN])(req, res, () => {
      return streamAuditEvents(req, res);
    });
  });
});

// All other audit log routes require authentication
router.use(requireAuth);

// Require appropriate roles for audit logs (Super Admin or IT Admin)
router.use(requireRole([ROLES.SUPER_ADMIN, ROLES.IT_ADMIN]));

// Get audit events with pagination and filters
router.get('/', getAuditEvents);

// Export to CSV/JSON (must be before /:id route to avoid conflict)
router.get('/export/csv', exportAuditLogCSV);
router.get('/export/json', exportAuditLogJSON);

// Verify audit log integrity
router.post('/verify', verifyAuditLogs);

// Get single audit event detail
router.get('/:id', getAuditEventDetail);

export default router;
