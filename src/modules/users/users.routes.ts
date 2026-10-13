import { Router } from 'express';

import { authenticate, authorize, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import {
  createEmployeeBodySchema,
  emergencySuspensionBodySchema,
  roleUpdateBodySchema,
  updateUserBodySchema,
  userIdParamSchema,
  userListQuerySchema,
} from './users.schemas.js';

export const usersRouter = Router();

// UC-10 / UC-EMP-01: Create employee account (Enterprise Admin, Recruiter, or System Admin)
usersRouter.post(
  '/',
  authenticate,
  // System admins create accounts via the invitation flow (POST /users in userInvitationsRouter, takes username).
  (req, _res, next) => (req.user?.role === 'admin' ? next('route') : next()),
  authorize('recruiter', 'enterprise_admin'),
  validateBody(createEmployeeBodySchema),
  usersController.createEmployee,
);

// UC-13 / UC-EMP-04 & UC-16 / UC-EMP-07 & UC-USER-01: View employee list & Search + Filter
usersRouter.get(
  '/',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateQuery(userListQuerySchema),
  usersController.listUsers,
);

// UC-15 / UC-EMP-06: View employee history
usersRouter.get(
  '/:id/history',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  usersController.getUserHistory,
);

// UC-12 / UC-EMP-03 & UC-USER-02: Update employee / user status
usersRouter.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  usersController.updateStatus,
);

// UC-USER-02: Update role (System Admin only)
usersRouter.patch(
  '/:id/role',
  authenticate,
  authorizeCurrentSystemAdmin,
  validateParams(userIdParamSchema),
  validateBody(roleUpdateBodySchema),
  usersController.updateRole,
);

// UC-USER-02: Emergency suspension (System Admin only)
usersRouter.patch(
  '/:id/emergency-suspension',
  authenticate,
  authorizeCurrentSystemAdmin,
  validateParams(userIdParamSchema),
  validateBody(emergencySuspensionBodySchema),
  usersController.emergencySuspend,
);

// UC-14 / UC-EMP-05 & UC-USER-01: View employee / user detail
usersRouter.get(
  '/:id',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  usersController.getUserById,
);

// UC-11 / UC-EMP-02 & UC-USER-02: Update employee / user information
usersRouter.patch(
  '/:id',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  validateBody(updateUserBodySchema),
  usersController.updateUser,
);
