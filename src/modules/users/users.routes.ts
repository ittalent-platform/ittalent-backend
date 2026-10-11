import { Router } from 'express';

import { authenticate, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import { statusUpdateBodySchema, updateUserBodySchema, userIdParamSchema, userListQuerySchema } from './users.schemas.js';

export const usersRouter = Router();

// UC-USER-01 / UC-USER-02: System Administrator only. Authorization runs before any input is validated.
usersRouter.get('/', authenticate, authorizeCurrentSystemAdmin, validateQuery(userListQuerySchema), usersController.listUsers);
usersRouter.patch('/:id/status', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateBody(statusUpdateBodySchema), usersController.updateStatus);
usersRouter.get('/:id', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), usersController.getUserById);
usersRouter.patch('/:id', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateBody(updateUserBodySchema), usersController.updateUser);
