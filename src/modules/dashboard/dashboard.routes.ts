import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorize, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateQuery } from '../../middleware/validate.js';
import { DASHBOARD_COMPANY_ROLES } from './dashboard.constants.js';
import { dashboardController } from './dashboard.controller.js';
import { companyDashboardQueryValidator } from './dashboard.schemas.js';

export const dashboardRouter = Router();

// HR and enterprise admins: the numbers of their own company. The role and the query are checked before any
// data is read; the account is then re-checked against the database so a revoked session sees nothing.
dashboardRouter.get(
  '/company',
  authenticate,
  authorize(...DASHBOARD_COMPANY_ROLES),
  validateQuery(companyDashboardQueryValidator),
  authenticateCurrentUser,
  dashboardController.getCompanyDashboard,
);

// System admins only, and re-checked against the database. Counts the platform; no company's hiring data.
dashboardRouter.get('/platform', authenticate, authorizeCurrentSystemAdmin, dashboardController.getPlatformOverview);
