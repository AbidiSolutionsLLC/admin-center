import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
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

const router = Router();

router.use(requireAuth);

router.get('/', getDepartments);
router.get('/tree', getOrgTree);
router.get('/bu-tree', getBUTree);
router.get('/business-units', getBusinessUnits);
router.get('/health', getOrgHealth);
router.get('/history', getOrgHistory);
router.get('/:id', getDepartmentById);
router.post('/', createDepartment);
router.put('/:id', updateDepartment);
router.put('/:id/move', moveDepartment);
router.delete('/:id', deleteDepartment);
router.delete('/business-units/:id', deleteBusinessUnit);

export default router;
