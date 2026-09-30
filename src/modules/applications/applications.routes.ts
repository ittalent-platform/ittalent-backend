import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery, validateParams } from '../../middleware/validate.js';
import {
  applicationHistoryQuerySchema,
  applicationIdParamSchema,
  applicationListQueryValidator,
  withdrawApplicationBodySchema,
} from './applications.schemas.js';
import { applicationsController } from './applications.controller.js';

export const applicationsRouter = Router();

applicationsRouter.use('/me/applications', authenticate, authorize('user'));

applicationsRouter.get(
  '/me/applications',
  validateQuery(applicationListQueryValidator),
  applicationsController.listMine,
);

applicationsRouter.get(
  '/me/applications/:id',
  validateParams(applicationIdParamSchema),
  applicationsController.getDetail,
);

applicationsRouter.get(
  '/me/applications/:id/history',
  validateParams(applicationIdParamSchema),
  validateQuery(applicationHistoryQuerySchema),
  applicationsController.getHistory,
);

applicationsRouter.patch(
  '/me/applications/:id/withdraw',
  validateParams(applicationIdParamSchema),
  validateBody(withdrawApplicationBodySchema),
  applicationsController.withdraw,
);