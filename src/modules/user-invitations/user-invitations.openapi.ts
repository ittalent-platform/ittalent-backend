import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createAdminUserBodySchema, userDtoSchema, userIdParamSchema } from '../users/users.schemas.js';
import { acceptExistingAccountInvitationSchema, acceptNewAccountInvitationSchema, existingRecruiterInvitationSchema } from './user-invitations.schemas.js';

export function registerUserInvitationsOpenApi(registry: OpenAPIRegistry): void {
  const createBody = registry.register('CreateAdminUserRequest', createAdminUserBodySchema);
  const createResult = registry.register('CreateAdminUserResponse', z.object({
    user: userDtoSchema,
    invitation: z.object({ expiresAt: z.string().datetime(), deliveryStatus: z.enum(['sent', 'failed']) }),
  }));
  const acceptNew = registry.register('AcceptNewAccountInvitationRequest', acceptNewAccountInvitationSchema);
  const acceptExisting = registry.register('AcceptExistingAccountInvitationRequest', acceptExistingAccountInvitationSchema);
  const inviteExisting = registry.register('InviteExistingUserRequest', existingRecruiterInvitationSchema);

  registry.registerPath({
    method: 'post', path: '/api/v1/users', tags: ['Users'], summary: 'Create a Candidate, HR or Enterprise Administrator account and send an invitation',
    security: [{ bearerAuth: [] }],
    request: { body: { required: true, content: { 'application/json': { schema: createBody } } } },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: { description: 'Account created; invitation delivery result is included', content: { 'application/json': { schema: createResult } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid role, user fields, or company context' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Email or username already exists' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Account storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/users/{id}/invitations', tags: ['Users'], summary: 'Invite an existing user to join an enterprise as HR',
    security: [{ bearerAuth: [] }], request: { params: userIdParamSchema, body: { required: true, content: { 'application/json': { schema: inviteExisting } } } },
    responses: {
      [HTTP_STATUS.HTTP_202_ACCEPTED]: { description: 'Invitation created and delivery attempted' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid user ID or enterprise ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User or enterprise not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'User cannot be granted an HR membership' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/users/{id}/invitation-deliveries', tags: ['Users'], summary: 'Resend a pending new-account invitation',
    security: [{ bearerAuth: [] }], request: { params: userIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_202_ACCEPTED]: { description: 'Invitation replaced and delivery attempted' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'No resendable invitation exists' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/user-invitations/accept', tags: ['Users'], summary: 'Accept a new-account invitation and set a password',
    request: { body: { required: true, content: { 'application/json': { schema: acceptNew } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Account activated; credentials are now available to the invitee' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid invitation payload' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'Invitation is expired, revoked or already used' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Account or enterprise state no longer permits acceptance' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/user-invitations/accept-existing', tags: ['Users'], summary: 'Accept an HR invitation as the authenticated existing user',
    security: [{ bearerAuth: [] }], request: { body: { required: true, content: { 'application/json': { schema: acceptExisting } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Existing account receives the invited HR membership' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Invitation belongs to another user' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'Invitation is expired, revoked or already used' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Account cannot accept the invited membership' },
    },
  });
}
