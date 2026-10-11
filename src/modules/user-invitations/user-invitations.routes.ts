import { Router } from 'express';
import { authenticate, authenticateCurrentUser, authorizeCurrentSystemAdmin } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { createAdminUserBodySchema, userIdParamSchema } from '../users/users.schemas.js';
import { userInvitationsController } from './user-invitations.controller.js';
import { acceptExistingAccountInvitationSchema, acceptNewAccountInvitationSchema, existingRecruiterInvitationSchema } from './user-invitations.schemas.js';

export const userInvitationsRouter = Router();

userInvitationsRouter.post('/users', authenticate, authorizeCurrentSystemAdmin, validateBody(createAdminUserBodySchema), userInvitationsController.createAccount);
userInvitationsRouter.post('/users/:id/invitations', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), validateBody(existingRecruiterInvitationSchema), userInvitationsController.inviteExisting);
userInvitationsRouter.post('/users/:id/invitation-deliveries', authenticate, authorizeCurrentSystemAdmin, validateParams(userIdParamSchema), userInvitationsController.resend);
userInvitationsRouter.post('/user-invitations/accept', validateBody(acceptNewAccountInvitationSchema), userInvitationsController.acceptNew);
userInvitationsRouter.post('/user-invitations/accept-existing', authenticate, authenticateCurrentUser, validateBody(acceptExistingAccountInvitationSchema), userInvitationsController.acceptExisting);
