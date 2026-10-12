import { Router } from 'express';

import { authenticate, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import { userIdParamSchema } from '../users/users.schemas.js';
import { userAuditsController } from './user-audits.controller.js';
import { userAuditHistoryQuerySchema } from './user-audits.schemas.js';

export const userAuditsRouter = Router();

userAuditsRouter.get('/:id/history', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateQuery(userAuditHistoryQuerySchema), userAuditsController.listUserHistory);
