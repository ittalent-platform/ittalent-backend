import { Router } from 'express';

import { validateParams, validateQuery } from '../../middleware/validate.js';
import { enterprisesController } from './enterprises.controller.js';
import { enterpriseIdParamSchema, enterpriseListQuerySchema } from './enterprises.schemas.js';

// Public routes: Guests and Applicants can browse; no authentication required.
export const enterprisesRouter = Router();

enterprisesRouter.get('/', validateQuery(enterpriseListQuerySchema), enterprisesController.listEnterprises);
enterprisesRouter.get(
  '/:enterpriseId',
  validateParams(enterpriseIdParamSchema),
  enterprisesController.getEnterpriseById,
);