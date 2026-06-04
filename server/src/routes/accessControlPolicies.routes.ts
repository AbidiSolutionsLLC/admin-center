import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  createPolicy,
  getPolicies,
  getPolicyById,
  updatePolicy,
  deletePolicy
} from '../controllers/accessControlPolicies.controller';

const router = Router();

router.use(requireAuth);
// Assuming policy management requires admin or similar role
router.use(requireRole(PERMISSION_GROUPS.OPS_ADMINS));

router.post('/', createPolicy);
router.get('/', getPolicies);
router.get('/:id', getPolicyById);
router.put('/:id', updatePolicy);
router.delete('/:id', deletePolicy);

export default router;
