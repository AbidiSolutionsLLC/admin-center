import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  createGovernancePolicy,
  getGovernancePolicies,
  getGovernancePolicyById,
  updateGovernancePolicy,
  deleteGovernancePolicy
} from '../controllers/dataGovernancePolicies.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole(PERMISSION_GROUPS.OPS_ADMINS));

router.post('/', createGovernancePolicy);
router.get('/', getGovernancePolicies);
router.get('/:id', getGovernancePolicyById);
router.put('/:id', updateGovernancePolicy);
router.delete('/:id', deleteGovernancePolicy);

export default router;
