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
  adminReportsQuerySchema,
  adminResolveReportSchema,
  createReportBodySchema,
  createReportSchema,
  reportIdParamSchema,
  reportsQuerySchema,
} from './reports.schemas.js';

// Applicant Reports Router (mounted at /api/v1/me/reports)
export const reportsRouter = Router();

reportsRouter.post(
  '/',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  parseReportEvidenceUpload,
  validateBody(createReportBodySchema),
  reportsController.submitReport,
);

reportsRouter.get(
  '/',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateQuery(reportsQuerySchema),
  reportsController.listReports,
);

reportsRouter.get(
  '/counts',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  reportsController.getCounts,
);

reportsRouter.get(
  '/:id',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.getReportDetail,
);

reportsRouter.post(
  '/:id/withdraw',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.withdrawReport,
);

reportsRouter.patch(
  '/:id/withdraw',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.withdrawReport,
);

reportsRouter.post(
  '/:id/hide',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.hideReport,
);

reportsRouter.patch(
  '/:id/hide',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.hideReport,
);

reportsRouter.delete(
  '/:id',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(reportIdParamSchema),
  reportsController.deleteMine,
);

export const meReportsRouter = reportsRouter;

// Admin Violation Investigation Router (mounted at /api/v1/reports and aliased at /api/v1/admin/reports)
export const adminReportsRouter = Router();

// Intake endpoint for authenticated violation reports (POST /api/v1/reports)
adminReportsRouter.post(
  '/',
  authenticate,
  validateBody(createReportSchema),
  reportsController.create,
);

adminReportsRouter.use(authenticate, authorize('admin'));

adminReportsRouter.get(
  '/',
  validateQuery(adminReportsQuerySchema),
  reportsController.listAdmin,
);

adminReportsRouter.get(
  '/:id',
  validateParams(reportIdParamSchema),
  reportsController.getAdminById,
);

adminReportsRouter.patch(
  '/:id/claim',
  validateParams(reportIdParamSchema),
  reportsController.claimTicket,
);

adminReportsRouter.patch(
  '/:id/resolve',
  validateParams(reportIdParamSchema),
  validateBody(adminResolveReportSchema),
  reportsController.resolveTicket,
);
