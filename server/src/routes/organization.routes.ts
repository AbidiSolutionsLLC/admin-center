import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getOrgTree,
  moveDepartment,
  getBUTree,
  getBusinessUnits,
  deleteBusinessUnit,
  getOrgHealth,
  getOrgHistory,
} from '../controllers/organization.controller';

import { PERMISSION_GROUPS } from '../constants/roles';

const router = Router();

router.use(requireAuth);

const DEPT_MANAGERS = PERMISSION_GROUPS.ROLE_ADMINS;

// Static routes first
router.get('/', getDepartments);
router.get('/tree', getOrgTree);
router.get('/bu-tree', getBUTree);
router.get('/business-units', getBusinessUnits);
router.get('/health', getOrgHealth);
router.get('/history', getOrgHistory);
router.delete('/business-units/:id', requireRole(DEPT_MANAGERS), deleteBusinessUnit);

// Parameterized routes last
router.get('/:id', getDepartmentById);
router.post('/', requireRole(DEPT_MANAGERS), createDepartment);
router.put('/:id', requireRole(DEPT_MANAGERS), updateDepartment);
router.put('/:id/move', requireRole(DEPT_MANAGERS), moveDepartment);
router.delete('/:id', requireRole(DEPT_MANAGERS), deleteDepartment);

export default router;
