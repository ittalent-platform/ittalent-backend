import { Router } from 'express';

import { parseLegalDocumentUpload } from '../../middleware/legal-document-upload.middleware.js';
import { registerRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { enterpriseRegistrationsController } from './enterprise-registrations.controller.js';
import {
  registrationIdParamSchema,
  saveDraftBodySchema,
  startRegistrationBodySchema,
  submitRegistrationBodySchema,
  uploadLegalDocumentBodySchema,
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

enterpriseRegistrationsRouter.get(
  '/:id',
  validateParams(registrationIdParamSchema),
  enterpriseRegistrationsController.getRegistration,
);

enterpriseRegistrationsRouter.patch(
  '/:id/draft',
  validateParams(registrationIdParamSchema),
  validateBody(saveDraftBodySchema),
  enterpriseRegistrationsController.saveDraft,
);

enterpriseRegistrationsRouter.post(
  '/:id/documents',
  parseLegalDocumentUpload,
  validateParams(registrationIdParamSchema),
  validateBody(uploadLegalDocumentBodySchema),
  enterpriseRegistrationsController.uploadLegalDocument,
);

enterpriseRegistrationsRouter.post(
  '/:id/submit',
  validateParams(registrationIdParamSchema),
  validateBody(submitRegistrationBodySchema),
  enterpriseRegistrationsController.submitRegistration,
);
