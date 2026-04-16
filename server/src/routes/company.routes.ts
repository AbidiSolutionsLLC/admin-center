// server/src/routes/company.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
import { getCompanySettings, updateEmployeeIdFormat } from '../controllers/company.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN])); // admins only

router.get('/settings',           getCompanySettings);
router.put('/settings/employee-id-format', updateEmployeeIdFormat);

export default router;
