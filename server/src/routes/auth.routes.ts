// server/src/routes/auth.routes.ts
import { Router } from 'express';
import { login, refresh, logout, getMe, setupPassword } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/setup-password', setupPassword);
router.get('/me', requireAuth, getMe);

export default router;
