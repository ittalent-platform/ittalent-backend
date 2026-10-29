import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authenticateOptional, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { enterprisesController } from './enterprises.controller.js';
import {
  createEnterpriseBodySchema,
  enterpriseIdParamSchema,
  enterpriseListQuerySchema,
  publicEnterpriseListQuerySchema,
  updateEnterpriseBodySchema,
  updateEnterpriseStatusBodySchema,
} from './enterprises.schemas.js';

export const enterprisesRouter = Router();

enterprisesRouter.post(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize('recruiter', 'admin', 'user'),
  validateBody(createEnterpriseBodySchema),
  enterprisesController.createEnterprise,
);

enterprisesRouter.get(
  '/',
  authenticateOptional,
  validateQuery(enterpriseListQuerySchema),
  enterprisesController.listEnterprises,
);

// UC-BENT-01/03: the applicant's public company list and its industry filter. Registered before /:enterpriseId.
enterprisesRouter.get('/public/industries', enterprisesController.listPublicIndustries);
enterprisesRouter.get('/public', validateQuery(publicEnterpriseListQuerySchema), enterprisesController.listPublicEnterprises);

// UC-17 / UC-ME-ENT-01: View my enterprise profile (direct endpoint)
enterprisesRouter.get(
  '/my-profile',
  authenticate,
  enterprisesController.getMyEnterpriseProfile,
);

enterprisesRouter.get(
  '/:enterpriseId',
  authenticateOptional,
  validateParams(enterpriseIdParamSchema),
  enterprisesController.getEnterpriseById,
);

enterprisesRouter.patch(
  '/:enterpriseId',
  authenticate,
  authenticateCurrentUser,
  validateParams(enterpriseIdParamSchema),
  validateBody(updateEnterpriseBodySchema),
  enterprisesController.updateEnterprise,
);

enterprisesRouter.patch(
  '/:enterpriseId/status',
  authenticate,
  authenticateCurrentUser,
  authorize('admin'),
  validateParams(enterpriseIdParamSchema),
  validateBody(updateEnterpriseStatusBodySchema),
  enterprisesController.updateEnterpriseStatus,
);

enterprisesRouter.delete(
  '/:enterpriseId',
  authenticate,
  authenticateCurrentUser,
  authorize('admin'),
  validateParams(enterpriseIdParamSchema),
  enterprisesController.deleteEnterprise,
);
