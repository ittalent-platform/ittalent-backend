import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { APPLICANT_ROLE } from './applications.constants.js';
import { applicationsController } from './applications.controller.js';
import {
  applicationHistoryQuerySchema,
  applicationIdParamSchema,
  applicationListQueryValidator,
  createApplicationBodySchema,
  withdrawApplicationBodySchema,
} from './applications.schemas.js';

export const applicationsRouter = Router();

// POST creates a new application record. After a Withdrawn/Rejected one it creates a NEW linked record (BR-APP-010).
applicationsRouter.post(
  '/',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateBody(createApplicationBodySchema),
  applicationsController.createApplication,
);

// UC-MYAPP-01 / 05: the candidate's own applications. Filter by `jobId` to see the caller's applications for one job.
applicationsRouter.get(
  '/',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateQuery(applicationListQueryValidator),
  applicationsController.listMine,
);

// UC-MYAPP-02
applicationsRouter.get(
  '/:id',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateParams(applicationIdParamSchema),
  applicationsController.getDetail,
);

// UC-MYAPP-03
applicationsRouter.get(
  '/:id/history',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateParams(applicationIdParamSchema),
  validateQuery(applicationHistoryQuerySchema),
  applicationsController.getHistory,
);

// UC-MYAPP-04: a state transition, so PATCH rather than POST.
applicationsRouter.patch(
  '/:id/withdraw',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateParams(applicationIdParamSchema),
  validateBody(withdrawApplicationBodySchema),
  applicationsController.withdraw,
);
