// server/src/routes/workflows.routes.ts
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getWorkflows,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  enableWorkflow,
  disableWorkflow,
  deleteWorkflow,
  addWorkflowStep,
  updateWorkflowStep,
  deleteWorkflowStep,
  reorderWorkflowSteps,
  getWorkflowRuns,
  testWorkflow,
  handleLifecycleTrigger,
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
 * POST /workflows
 * Create a new workflow (draft)
 */
router.post('/', createWorkflow);

/**
 * POST /workflows/trigger/lifecycle_changed
 * Internal: fires when user lifecycle changes
 */
router.post('/trigger/lifecycle_changed', handleLifecycleTrigger);

/**
 * GET /workflows/:id
 * Get a workflow with its steps
 */
router.get('/:id', getWorkflowById);

/**
 * PUT /workflows/:id
 * Update a draft workflow
 */
router.put('/:id', requireRole(['super_admin', 'ops_admin']), updateWorkflow);

/**
 * POST /workflows/:id/enable
 * Enable a draft workflow
 */
router.post('/:id/enable', requireRole(['super_admin', 'ops_admin']), enableWorkflow);

/**
 * POST /workflows/:id/disable
 * Disable an enabled workflow
 */
router.post('/:id/disable', requireRole(['super_admin', 'ops_admin']), disableWorkflow);

/**
 * DELETE /workflows/:id
 * Delete a draft workflow
 */
router.delete('/:id', requireRole(['super_admin', 'ops_admin']), deleteWorkflow);

/**
 * POST /workflows/:id/steps
 * Add a step to a workflow
 */
router.post('/:id/steps', requireRole(['super_admin', 'ops_admin']), addWorkflowStep);

/**
 * PUT /workflows/:id/steps/:stepId
 * Update an existing step
 */
router.put('/:id/steps/:stepId', requireRole(['super_admin', 'ops_admin']), updateWorkflowStep);

/**
 * DELETE /workflows/:id/steps/:stepId
 * Delete a step
 */
router.delete('/:id/steps/:stepId', requireRole(['super_admin', 'ops_admin']), deleteWorkflowStep);

/**
 * POST /workflows/:id/steps/reorder
 * Reorder steps via drag-and-drop
 */
router.post('/:id/steps/reorder', requireRole(['super_admin', 'ops_admin']), reorderWorkflowSteps);

/**
 * GET /workflows/:id/runs
 * Get execution history
 */
router.get('/:id/runs', getWorkflowRuns);

/**
 * POST /workflows/:id/test
 * Test workflow with mock payload
 */
router.post('/:id/test', requireRole(['super_admin', 'ops_admin']), testWorkflow);

export default router;
