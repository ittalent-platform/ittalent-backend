import { Router } from 'express';

import { registerRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { enterpriseRegistrationsController } from './enterprise-registrations.controller.js';
import {
  startRegistrationBodySchema,
  verifyEmailQuerySchema,
} from './enterprise-registrations.schemas.js';

export const enterpriseRegistrationsRouter = Router();

enterpriseRegistrationsRouter.post(
  '/start',
  registerRateLimit,
  validateBody(startRegistrationBodySchema),
  enterpriseRegistrationsController.startRegistration,
);

enterpriseRegistrationsRouter.get(
  '/verify-email',
  validateQuery(verifyEmailQuerySchema),
  enterpriseRegistrationsController.verifyEmail,
);
