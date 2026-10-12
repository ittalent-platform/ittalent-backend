import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { emailChangeConfirmationIpRateLimit, emailChangeConfirmationRateLimit } from '../../middleware/rate-limit.middleware.js';
import { updateUserEmailBodySchema, userIdParamSchema } from '../users/users.schemas.js';
import { userEmailChangesController } from './user-email-changes.controller.js';
import { confirmUserEmailChangeSchema } from './user-email-changes.schemas.js';

export const userEmailChangesRouter = Router();

userEmailChangesRouter.post('/users/:id/email-change-requests', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateBody(updateUserEmailBodySchema), userEmailChangesController.request);
userEmailChangesRouter.post('/user-email-changes/confirm', authenticate, authenticateCurrentUser, emailChangeConfirmationRateLimit, emailChangeConfirmationIpRateLimit, validateBody(confirmUserEmailChangeSchema), userEmailChangesController.confirm);
