import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import { updateUserBodySchema, userIdParamSchema, userListQuerySchema } from './users.schemas.js';

export const usersRouter = Router();

// UC-USER-01 / UC-USER-02: System Administrator only. Authorization runs before any input is validated.
usersRouter.get('/', authenticate, authorize('admin'), validateQuery(userListQuerySchema), usersController.listUsers);
usersRouter.get('/:id', authenticate, authorize('admin'), validateParams(userIdParamSchema), usersController.getUserById);
usersRouter.patch('/:id', authenticate, authorize('admin'), validateParams(userIdParamSchema), validateBody(updateUserBodySchema), usersController.updateUser);
