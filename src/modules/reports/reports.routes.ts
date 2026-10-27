import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { reportsController } from './reports.controller.js';
import {
  adminReportsQuerySchema,
  adminResolveReportSchema,
  createReportSchema,
  reporterReportsQuerySchema,
  reportIdParamSchema,
  withdrawReportSchema,
} from './reports.schemas.js';

// Router for public/reporter submission: /api/v1/reports
export const publicReportsRouter = Router();
publicReportsRouter.use(authenticate);

// UC-30: Create a report
publicReportsRouter.post(
  '/',
  validateBody(createReportSchema),
  reportsController.create,
);

// Router for personal reporter management: /api/v1/me/reports
export const meReportsRouter = Router();
meReportsRouter.use(authenticate);

// UC-31: View list report of reporter
meReportsRouter.get(
  '/',
  validateQuery(reporterReportsQuerySchema),
  reportsController.listMine,
);

// UC-32: View report detail of reporter
meReportsRouter.get(
  '/:id',
  validateParams(reportIdParamSchema),
  reportsController.getMineById,
);

// UC-33: Withdraw a report
meReportsRouter.patch(
  '/:id/withdraw',
  validateParams(reportIdParamSchema),
  validateBody(withdrawReportSchema),
  reportsController.withdrawMine,
);

// UC-34: Delete report (soft-hide from history)
meReportsRouter.delete(
  '/:id',
  validateParams(reportIdParamSchema),
  reportsController.deleteMine,
);

// Router for admin violation review queue: /api/v1/admin/reports
export const adminReportsRouter = Router();
adminReportsRouter.use(authenticate, authorize('admin'));

// UC-35: View list report of reporter [Admin Review Queue]
adminReportsRouter.get(
  '/',
  validateQuery(adminReportsQuerySchema),
  reportsController.listAdmin,
);

// UC-36: View report detail of reporter [Investigation & Resolution Console]
adminReportsRouter.get(
  '/:id',
  validateParams(reportIdParamSchema),
  reportsController.getAdminById,
);

// UC-36: Claim ticket
adminReportsRouter.patch(
  '/:id/claim',
  validateParams(reportIdParamSchema),
  reportsController.claimTicket,
);

// UC-36: Finalize resolution
adminReportsRouter.patch(
  '/:id/resolve',
  validateParams(reportIdParamSchema),
  validateBody(adminResolveReportSchema),
  reportsController.resolveTicket,
);
