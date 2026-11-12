// server/src/routes/streamTickets.routes.ts — SSE Stream tickets (05 §3)
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { issueStreamTicket } from '../platform/streamTickets';

const router = Router();

// POST /api/v1/stream-tickets — single-use 60s stream ticket
router.post('/', requireAuth, issueStreamTicket);

export default router;
