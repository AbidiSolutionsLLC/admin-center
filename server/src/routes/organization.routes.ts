import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getOrgTree,
  getBUTree,
  getBusinessUnits,
  deleteBusinessUnit,
} from '../controllers/organization.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getDepartments);
router.get('/tree', getOrgTree);
router.get('/bu-tree', getBUTree);
router.get('/business-units', getBusinessUnits);
router.get('/:id', getDepartmentById);
router.post('/', createDepartment);
router.put('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);
router.delete('/business-units/:id', deleteBusinessUnit);

export default router;
