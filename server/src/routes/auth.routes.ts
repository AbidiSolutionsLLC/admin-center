// server/src/routes/auth.routes.ts
import { Router } from 'express';
import { login, refresh, logout, getMe, getMyPermissions, setupPassword, requestPasswordReset, resetPassword, verifyMfa } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/verify-mfa', authLimiter, verifyMfa);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/setup-password', authLimiter, setupPassword);
router.post('/request-password-reset', authLimiter, requestPasswordReset);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/me', requireAuth, getMe);
router.get('/my-permissions', requireAuth, getMyPermissions);

export default router;
