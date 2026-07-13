import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { PERMISSION_GROUPS } from '../constants/roles';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createWorkflowFromTemplate,
  saveWorkflowAsTemplate,
} from '../controllers/workflowTemplates.controller';

const router = Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /workflow-templates
 * List all workflow templates
 */
router.get('/', getTemplates);

/**
 * GET /workflow-templates/:id
 * Get a specific template
 */
router.get('/:id', getTemplateById);

/**
 * POST /workflow-templates
 * Create a new template from scratch
 */
router.post('/', requireRole(PERMISSION_GROUPS.OPS_ADMINS), createTemplate);

/**
 * POST /workflow-templates/:id/instantiate
 * Create a new workflow from this template
 */
router.post('/:id/instantiate', requireRole(PERMISSION_GROUPS.OPS_ADMINS), createWorkflowFromTemplate);

/**
 * POST /workflow-templates/from-workflow/:id
 * Save an existing workflow as a template
 */
router.post('/from-workflow/:id', requireRole(PERMISSION_GROUPS.OPS_ADMINS), saveWorkflowAsTemplate);

/**
 * PUT /workflow-templates/:id
 * Update a template
 */
router.put('/:id', requireRole(PERMISSION_GROUPS.OPS_ADMINS), updateTemplate);

/**
 * DELETE /workflow-templates/:id
 * Delete a template
 */
router.delete('/:id', requireRole(PERMISSION_GROUPS.OPS_ADMINS), deleteTemplate);

export default router;
