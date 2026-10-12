import { Router } from 'express';
import { authenticate, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { invitationTokenRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { cancelInvitationBodySchema, createAdminUserBodySchema, userIdParamSchema } from '../users/users.schemas.js';
import { userInvitationsController } from './user-invitations.controller.js';
import { acceptNewAccountInvitationSchema, invitationPreviewQuerySchema } from './user-invitations.schemas.js';
import { USER_INVITATION_MESSAGES } from './user-invitations.constants.js';

export const userInvitationsRouter = Router();

userInvitationsRouter.post('/users', authenticate, authorizeCurrentSystemAdmin, validateBody(createAdminUserBodySchema), userInvitationsController.createAccount);
userInvitationsRouter.get('/users/:id/invitation', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), userInvitationsController.status);
userInvitationsRouter.post('/users/:id/invitation-deliveries', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), userInvitationsController.resend);
userInvitationsRouter.patch('/users/:id/invitation', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateBody(cancelInvitationBodySchema), userInvitationsController.cancel);
userInvitationsRouter.get('/user-invitations/preview', invitationTokenRateLimit, validateQuery(invitationPreviewQuerySchema), userInvitationsController.preview);
userInvitationsRouter.post('/user-invitations/accept', invitationTokenRateLimit, validateBody(acceptNewAccountInvitationSchema), userInvitationsController.acceptNew);
userInvitationsRouter.post('/user-invitations/accept-existing', (_req, _res, next) => next(createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID)));
