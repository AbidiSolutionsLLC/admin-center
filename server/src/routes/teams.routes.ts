// server/src/routes/teams.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getTeams,
  getTeamById,
  createTeam,
  updateTeam,
  deleteTeam,
  getTeamMembers,
  addTeamMember,
  updateTeamMember,
  removeTeamMember,
} from '../controllers/teams.controller';

const router = Router();

// All team routes require authentication
router.use(requireAuth);

// ── Team routes ──────────────────────────────────────────────────────────────
router.get('/', getTeams);
router.get('/:id', getTeamById);
router.post('/', createTeam);
router.put('/:id', updateTeam);
router.delete('/:id', deleteTeam);

// ── Team Member routes ───────────────────────────────────────────────────────
router.get('/:id/members', getTeamMembers);
router.post('/:id/members', addTeamMember);
router.put('/:id/members/:memberId', updateTeamMember);
router.delete('/:id/members/:memberId', removeTeamMember);

export default router;
