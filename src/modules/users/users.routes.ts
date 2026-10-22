import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorize, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import {
  createEmployeeBodySchema,
  emergencySuspensionBodySchema,
  roleUpdateBodySchema,
  statusUpdateBodySchema,
  updateUserBodySchema,
  userIdParamSchema,
  userListQuerySchema,
} from './users.schemas.js';

export const usersRouter = Router();

// UC-10 / UC-EMP-01: Create employee account (Enterprise Admin only)
usersRouter.post(
  '/',
  authenticate,
  authenticateCurrentUser,
  // System admins create accounts via the invitation flow (POST /users in userInvitationsRouter, takes username).
  (req, _res, next) => (req.user?.role === 'admin' ? next('route') : next()),
  authorize('enterprise_admin'),
  validateBody(createEmployeeBodySchema),
  usersController.createEmployee,
);

// UC-13 / UC-EMP-04 & UC-16 / UC-EMP-07 & UC-USER-01: View employee list & Search + Filter
usersRouter.get(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateQuery(userListQuerySchema),
  usersController.listUsers,
);

// UC-12 / UC-EMP-03 & UC-USER-02: Update employee / user status
usersRouter.patch(
  '/:id/status',
  authenticate,
  authenticateCurrentUser,
  authorize('admin', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  validateBody(statusUpdateBodySchema),
  usersController.updateStatus,
);

// UC-USER-02: Update role (System Admin only)
usersRouter.patch(
  '/:id/role',
  authenticate,
  authenticateCurrentUser,
  authorizeCurrentSystemAdmin,
  validateParams(userIdParamSchema),
  validateBody(roleUpdateBodySchema),
  usersController.updateRole,
);

// UC-USER-02: Emergency suspension (System Admin only)
usersRouter.patch(
  '/:id/emergency-suspension',
  authenticate,
  authenticateCurrentUser,
  authorizeCurrentSystemAdmin,
  validateParams(userIdParamSchema),
  validateBody(emergencySuspensionBodySchema),
  usersController.emergencySuspend,
);

// UC-14 / UC-EMP-05 & UC-USER-01: View employee / user detail
usersRouter.get(
  '/:id',
  authenticate,
  authenticateCurrentUser,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  usersController.getUserById,
);

// UC-11 / UC-EMP-02 & UC-USER-02: Update employee / user information
usersRouter.patch(
  '/:id',
  authenticate,
  authenticateCurrentUser,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  validateBody(updateUserBodySchema),
  usersController.updateUser,
);
