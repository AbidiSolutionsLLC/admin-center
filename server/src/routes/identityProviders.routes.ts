// server/src/routes/identityProviders.routes.ts
import { Router } from 'express';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getIdentityProviders,
  createIdentityProvider,
  updateIdentityProvider,
  verifyDomain,
} from '../controllers/identityProviders.controller';

const router = Router();

// IT_ADMINS includes Super Admin, Admin, IT Admin
router.use(requireRole(PERMISSION_GROUPS.IT_ADMINS));

router.get('/', getIdentityProviders);
router.post('/', createIdentityProvider);
router.patch('/:id', updateIdentityProvider);
router.post('/:id/domains/:domain/verify', verifyDomain);

export default router;
