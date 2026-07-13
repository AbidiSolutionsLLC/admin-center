// server/src/routes/company.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { ROLES } from '../constants/roles';
import {
  getCompanySettings,
  updateEmployeeIdFormat,
  updateRequiredUserFields,
  updateDomainEnforcement,
  resetCompanySettings,
  updateCompanyName,
  updateTimezone,
  updateLocale,
  updateDefaultLocation,
} from '../controllers/company.controller';

const router = Router();

router.use(requireAuth);
router.use(requireRole([ROLES.SUPER_ADMIN, ROLES.ADMIN])); // admins only

router.get('/settings',                           getCompanySettings);
router.post('/settings/reset',                    resetCompanySettings);
router.put('/settings/employee-id-format',        updateEmployeeIdFormat);
router.put('/settings/required-user-fields',      updateRequiredUserFields);
router.put('/settings/domain-enforcement',        updateDomainEnforcement);
router.put('/settings/company-name',              updateCompanyName);
router.put('/settings/timezone',                  updateTimezone);
router.put('/settings/locale',                    updateLocale);
router.put('/settings/default-location',           updateDefaultLocation);

export default router;
