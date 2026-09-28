import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.js';
import { APPLICANT_ROLE } from './applications.constants.js';
import { applicationsController } from './applications.controller.js';
import { createApplicationBodySchema } from './applications.schemas.js';

export const applicationsRouter = Router();

// POST creates a new application record (or reactivates a Withdrawn/Rejected one).
applicationsRouter.post(
  '/',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateBody(createApplicationBodySchema),
  applicationsController.createApplication,
);