import { Router } from 'express';

import {
  authenticate,
  authenticateCurrentUser,
  authorize,
} from '../../middleware/auth.middleware.js';
import { parseReportEvidenceUpload } from '../../middleware/report-upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { CANDIDATE_ROLES } from './reports.constants.js';
import { reportsController } from './reports.controller.js';
import {
  createReportBodySchema,
  reportIdParamSchema,
  reportsQuerySchema,
} from './reports.schemas.js';

export const reportsRouter = Router();

reportsRouter.post(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  parseReportEvidenceUpload,
  validateBody(createReportBodySchema),
  reportsController.submitReport,
);

reportsRouter.get(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateQuery(reportsQuerySchema),
  reportsController.listReports,
);

reportsRouter.get(
  '/:id',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.getReportDetail,
);

reportsRouter.post(
  '/:id/withdraw',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.withdrawReport,
);

reportsRouter.patch(
  '/:id/withdraw',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.withdrawReport,
);

reportsRouter.post(
  '/:id/hide',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.hideReport,
);

reportsRouter.patch(
  '/:id/hide',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.hideReport,
);
