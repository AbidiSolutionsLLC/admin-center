import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getOrgTree,
} from '../controllers/organization.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getDepartments);
router.get('/tree', getOrgTree);
router.get('/:id', getDepartmentById);
router.post('/', createDepartment);
router.put('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);

export default router;
