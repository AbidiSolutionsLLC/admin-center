import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
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

const TEAM_MANAGERS = ['Super Admin', 'HR Admin', 'Ops Admin'];

// ── Team routes ──────────────────────────────────────────────────────────────
router.get('/', getTeams);
router.get('/:id', getTeamById);
router.post('/', requireRole(TEAM_MANAGERS), createTeam);
router.put('/:id', requireRole(TEAM_MANAGERS), updateTeam);
router.delete('/:id', requireRole(TEAM_MANAGERS), deleteTeam);

// ── Team Member routes ───────────────────────────────────────────────────────
router.get('/:id/members', getTeamMembers);
router.post('/:id/members', requireRole(TEAM_MANAGERS), addTeamMember);
router.put('/:id/members/:memberId', requireRole(TEAM_MANAGERS), updateTeamMember);
router.delete('/:id/members/:memberId', requireRole(TEAM_MANAGERS), removeTeamMember);

export default router;
