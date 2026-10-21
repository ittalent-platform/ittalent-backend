import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorize } from '../../middleware/auth.middleware.js';
import { validateParams, validateQuery } from '../../middleware/validate.js';
import { userIdParamSchema } from '../users/users.schemas.js';
import { userAuditsController } from './user-audits.controller.js';
import { userAuditHistoryQuerySchema } from './user-audits.schemas.js';

export const userAuditsRouter = Router();

userAuditsRouter.get('/:id/history', authenticate, authenticateCurrentUser, authorize('admin', 'recruiter', 'enterprise_admin'), validateParams(userIdParamSchema), validateQuery(userAuditHistoryQuerySchema), userAuditsController.listUserHistory);
