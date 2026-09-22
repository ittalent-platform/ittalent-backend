import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import { validateParams } from '../../middleware/validate.js';
import { usersController } from './users.controller.js';
import { userIdParamSchema } from './users.schemas.js';

export const usersRouter = Router();

usersRouter.get('/:id', authenticate, validateParams(userIdParamSchema), usersController.getUserById);
