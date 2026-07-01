import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPendingApprovals, approveRequest, rejectRequest } from '../controllers/approvals.controller';

const router = Router();

router.use(requireAuth);

router.get('/pending', getPendingApprovals);
router.post('/:id/approve', approveRequest);
router.post('/:id/reject', rejectRequest);

export default router;
