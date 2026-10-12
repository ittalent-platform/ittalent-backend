import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateQuery } from '../../middleware/validate.js';
import { RECRUITER_ROLES } from './applications.constants.js';
import { recruiterApplicationsController } from './recruiter-applications.controller.js';
import { recruiterApplicationListQueryValidator } from './recruiter-applications.schemas.js';

export const recruiterApplicationsRouter = Router();

// UC-S2-AA-01, 05, 06: Enterprise recruiter applications listing, search, and filter
recruiterApplicationsRouter.get(
  '/recruiter/applications',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateQuery(recruiterApplicationListQueryValidator),
  recruiterApplicationsController.list,
);
