// server/src/routes/auth.routes.ts
// E2: /login, /verify-mfa and /refresh were removed — sign-in is OIDC via /realms/tenant (src/identity).
import { Router } from 'express';
import { logout, getMe, getMyPermissions, setupPassword, requestPasswordReset, resetPassword } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/logout', requireAuth, logout);
router.post('/setup-password', authLimiter, setupPassword);
router.post('/request-password-reset', authLimiter, requestPasswordReset);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/me', requireAuth, getMe);
router.get('/my-permissions', requireAuth, getMyPermissions);

export default router;
