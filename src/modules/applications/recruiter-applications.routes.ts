import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { RECRUITER_ROLES } from './applications.constants.js';
import { applicationIdParamSchema } from './applications.schemas.js';
import { recruiterApplicationsController } from './recruiter-applications.controller.js';
import {
  createRecruiterNoteBodySchema,
  recruiterApplicationListQueryValidator,
  updateRecruiterApplicationStatusBodySchema,
} from './recruiter-applications.schemas.js';

export const recruiterApplicationsRouter = Router();

// UC-S2-AA-01, 05, 06: Enterprise recruiter applications listing, search, and filter
recruiterApplicationsRouter.get(
  '/recruiter/applications',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateQuery(recruiterApplicationListQueryValidator),
  recruiterApplicationsController.list,
);

// UC-S2-AA-02: Enterprise recruiter application detail view
recruiterApplicationsRouter.get(
  '/recruiter/applications/:id',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  recruiterApplicationsController.getDetail,
);

// UC-S2-AA-04: Enterprise recruiter applicant CV download
recruiterApplicationsRouter.get(
  '/recruiter/applications/:id/cv',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  recruiterApplicationsController.downloadCv,
);

// UC-S2-AA-03: Add recruiter internal note to application
recruiterApplicationsRouter.post(
  '/recruiter/applications/:id/notes',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  validateBody(createRecruiterNoteBodySchema),
  recruiterApplicationsController.addNote,
);

// UC-S2-AA-03: List recruiter internal notes for application
recruiterApplicationsRouter.get(
  '/recruiter/applications/:id/notes',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  recruiterApplicationsController.listNotes,
);
// UC-S2-AA-03: Update recruiter application status workflow (BR-17, BR-18, BR-24, BR-37)
recruiterApplicationsRouter.patch(
  '/recruiter/applications/:id/status',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  validateBody(updateRecruiterApplicationStatusBodySchema),
  recruiterApplicationsController.updateStatus,
);

// UC-S2-AA-07: Enterprise recruiter candidate cross-job company application history
recruiterApplicationsRouter.get(
  '/recruiter/applications/:id/company-history',
  authenticate,
  authorize(...RECRUITER_ROLES),
  validateParams(applicationIdParamSchema),
  recruiterApplicationsController.getCompanyHistory,
);

