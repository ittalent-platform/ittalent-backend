import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import {
  createEmployeeBodySchema,
  updateUserBodySchema,
  updateUserStatusBodySchema,
  userIdParamSchema,
  userListQuerySchema,
} from './users.schemas.js';

export const usersRouter = Router();

// UC-10 / UC-EMP-01: Create employee account (Enterprise Admin, Recruiter, or System Admin)
usersRouter.post(
  '/',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateBody(createEmployeeBodySchema),
  usersController.createEmployee,
);

// UC-13 / UC-EMP-04 & UC-16 / UC-EMP-07: View employee list & Search + Filter
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

// UC-12 / UC-EMP-03: Update employee status (Suspend / Activate)
usersRouter.patch(
  '/:id/status',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  validateBody(updateUserStatusBodySchema),
  usersController.updateUserStatus,
);

// UC-14 / UC-EMP-05: View employee detail
usersRouter.get(
  '/:id',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  usersController.getUserById,
);

// UC-11 / UC-EMP-02: Update employee information
usersRouter.patch(
  '/:id',
  authenticate,
  authorize('admin', 'recruiter', 'enterprise_admin'),
  validateParams(userIdParamSchema),
  validateBody(updateUserBodySchema),
  usersController.updateUser,
);
