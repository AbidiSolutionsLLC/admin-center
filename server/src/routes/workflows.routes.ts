// server/src/routes/workflows.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getWorkflows,
  getWorkflowVersions,
  createWorkflow,
  updateWorkflow,
  publishWorkflow,
  archiveWorkflow,
  deleteWorkflow,
  createDraftWorkflow,
  rollbackWorkflow,
  addWorkflowStep,
  updateWorkflowStep,
  deleteWorkflowStep,
  reorderWorkflowSteps,
  getWorkflowRuns,
  testWorkflow,
  handleLifecycleTrigger,
  simulateWorkflowHandler,
  getWorkflowById,
} from '../controllers/workflows.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /workflows
 * List all workflows with optional status filter
 */
router.get('/', getWorkflows);

/**
 * GET /workflows/versions
 * List all versions of a specific workflow
 */
router.get('/versions', getWorkflowVersions);

/**
 * GET /workflows/:id
 * Get a workflow with its steps
 */
router.get('/:id', getWorkflowById);

/**
 * POST /workflows
 * Create a new workflow (draft)
 */
router.post('/', requireRole(PERMISSION_GROUPS.OPS_ADMINS), createWorkflow);

/**
 * POST /workflows/trigger/lifecycle_changed
 * Internal: fires when user lifecycle changes
 */
router.post('/trigger/lifecycle_changed', handleLifecycleTrigger);



/**
 * PUT /workflows/:id
 * Update a draft workflow
 */
router.put('/:id', requireRole(PERMISSION_GROUPS.OPS_ADMINS), updateWorkflow);

/**
 * POST /workflows/:id/publish
 * Publish a draft workflow
 */
router.post('/:id/publish', requireRole(PERMISSION_GROUPS.OPS_ADMINS), publishWorkflow);

/**
 * POST /workflows/:id/archive
 * Archive a published workflow
 */
router.post('/:id/archive', requireRole(PERMISSION_GROUPS.OPS_ADMINS), archiveWorkflow);

/**
 * POST /workflows/:id/draft
 * Create a new draft from an existing version
 */
router.post('/:id/draft', requireRole(PERMISSION_GROUPS.OPS_ADMINS), createDraftWorkflow);

/**
 * POST /workflows/:id/rollback
 * Rollback to a previous version
 */
router.post('/:id/rollback', requireRole(PERMISSION_GROUPS.OPS_ADMINS), rollbackWorkflow);

/**
 * DELETE /workflows/:id
 * Delete a draft workflow
 */
router.delete('/:id', requireRole(PERMISSION_GROUPS.OPS_ADMINS), deleteWorkflow);

/**
 * POST /workflows/:id/steps
 * Add a step to a workflow
 */
router.post('/:id/steps', requireRole(PERMISSION_GROUPS.OPS_ADMINS), addWorkflowStep);

/**
 * POST /workflows/:id/steps/reorder
 * Reorder steps via drag-and-drop
 */
router.post('/:id/steps/reorder', requireRole(PERMISSION_GROUPS.OPS_ADMINS), reorderWorkflowSteps);

/**
 * PUT /workflows/:id/steps/:stepId
 * Update an existing step
 */
router.put('/:id/steps/:stepId', requireRole(PERMISSION_GROUPS.OPS_ADMINS), updateWorkflowStep);

/**
 * DELETE /workflows/:id/steps/:stepId
 * Delete a step
 */
router.delete('/:id/steps/:stepId', requireRole(PERMISSION_GROUPS.OPS_ADMINS), deleteWorkflowStep);

/**
 * GET /workflows/:id/runs
 * Get execution history
 */
router.get('/:id/runs', getWorkflowRuns);

/**
 * POST /workflows/:id/test
 * Test workflow with mock payload
 */
router.post('/:id/test', requireRole(PERMISSION_GROUPS.OPS_ADMINS), testWorkflow);

/**
 * POST /workflows/:id/simulate
 * Simulates a workflow without executing side effects
 */
router.post('/:id/simulate', requireRole(PERMISSION_GROUPS.OPS_ADMINS), simulateWorkflowHandler);

export default router;
