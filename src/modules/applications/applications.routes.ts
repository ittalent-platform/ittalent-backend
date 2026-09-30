import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { APPLICANT_ROLE } from './applications.constants.js';
import { applicationsController } from './applications.controller.js';
import { createApplicationBodySchema, myApplicationQuerySchema } from './applications.schemas.js';

export const applicationsRouter = Router();

// POST creates a new application record. After a Withdrawn/Rejected one it creates a NEW linked record (BR-APP-010).
applicationsRouter.post(
  '/',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateBody(createApplicationBodySchema),
  applicationsController.createApplication,
);

// GET returns the caller's latest application for one job (or { item: null }).
applicationsRouter.get(
  '/mine',
  authenticate,
  authorize(APPLICANT_ROLE),
  validateQuery(myApplicationQuerySchema),
  applicationsController.getMyApplication,
);