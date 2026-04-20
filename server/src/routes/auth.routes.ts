// server/src/routes/auth.routes.ts
import { Router } from 'express';
import { login, refresh, logout, getMe, setupPassword } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/setup-password', authLimiter, setupPassword);
router.get('/me', requireAuth, getMe);

export default router;
