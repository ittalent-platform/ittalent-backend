import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { userDtoSchema, userIdParamSchema } from '../users/users.schemas.js';
import { acceptNewAccountInvitationSchema, cancelInvitationBodySchema, createAdminUserBodySchema, invitationPreviewQuerySchema } from './user-invitations.schemas.js';

export function registerUserInvitationsOpenApi(registry: OpenAPIRegistry): void {
  const invitationStatus = registry.register('UserInvitationStatusResponse', z.object({
    status: z.enum(['pending', 'accepted', 'revoked', 'cancelled', 'expired']),
    kind: z.enum(['new_account', 'enterprise_membership']),
    role: z.enum(['user', 'recruiter', 'enterprise_admin']),
    expiresAt: z.string().datetime(),
    sentAt: z.string().datetime().nullable(),
    deliveryStatus: z.enum(['pending', 'sent', 'failed']),
    deliveryAttempts: z.number().int().nonnegative(),
  }).nullable());
  const previewResponse = registry.register('InvitationPreviewResponse', z.object({
    email: z.string().email(),
    role: z.enum(['user', 'recruiter', 'enterprise_admin']),
    enterpriseName: z.string().nullable(),
    expiresAt: z.string().datetime(),
  }));
  const acceptedResponse = registry.register('AcceptedInvitationResponse', z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.string(),
    status: z.string(),
  }));
  const deliveryResponse = registry.register('InvitationDeliveryResponse', z.object({
    deliveryStatus: z.enum(['sent', 'failed']),
    expiresAt: z.string().datetime(),
  }));
  registry.register('CreateAdminUserRequest', createAdminUserBodySchema);
  registry.register('CreateAdminUserResponse', z.object({
    user: userDtoSchema,
    invitation: z.object({ expiresAt: z.string().datetime(), deliveryStatus: z.enum(['sent', 'failed']) }),
  }));
  const acceptNew = registry.register('AcceptNewAccountInvitationRequest', acceptNewAccountInvitationSchema);
  const previewQuery = registry.register('InvitationPreviewQuery', invitationPreviewQuerySchema);
  const cancelBody = registry.register('CancelInvitationRequest', cancelInvitationBodySchema);

  // One operation for both callers (the document keeps a single operation per path and method):
  // a System Administrator invites any role (CreateAdminUserRequest); an Enterprise Administrator
  // provisions a recruiter in their own company (CreateEmployeeRequest, UC-10).
  registry.registerPath({
    method: 'post', path: '/api/v1/users', tags: ['Users', 'Employees'], summary: 'Create an account',
    description: 'System Administrators create a Candidate, HR or Enterprise Administrator account and send an invitation. Enterprise Administrators create a recruiter account under their own company.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/CreateAdminUserRequest' }, { $ref: '#/components/schemas/CreateEmployeeRequest' }] } } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Account created. A System Administrator gets the invitation result (delivery status may be sent or failed); an Enterprise Administrator gets the new user',
        content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/CreateAdminUserResponse' }, { $ref: '#/components/schemas/UserDTO' }] } } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid role, user fields, or company context' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator or Enterprise Administrator required' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Email or username conflict, enterprise unavailable, or enterprise onboarding pending' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Account storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'get', path: '/api/v1/users/{id}/invitation', tags: ['Users'], summary: 'Read the latest invitation status for an account',
    security: [{ bearerAuth: [] }], request: { params: userIdParamSchema },
     responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Latest invitation delivery and lifecycle state, or null', content: { 'application/json': { schema: invitationStatus } } },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Account not found' },
    },
  });

  registry.registerPath({
    method: 'patch', path: '/api/v1/users/{id}/invitation', tags: ['Users'], summary: 'Cancel an invitation for an account that has not activated',
    security: [{ bearerAuth: [] }], request: { params: userIdParamSchema, body: { required: true, content: { 'application/json': { schema: cancelBody } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Invitation cancelled', content: { 'application/json': { schema: z.object({ success: z.literal(true) }) } } },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Account is no longer invited or version is stale' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'No pending invitation exists' },
    },
  });

  registry.registerPath({
    method: 'get', path: '/api/v1/user-invitations/preview', tags: ['Users'], summary: 'Preview the account and company named by an invitation token',
    request: { query: previewQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Invitation recipient, role and company', content: { 'application/json': { schema: previewResponse } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid token format' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'Invitation is expired, revoked or already used' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Account or enterprise state no longer permits acceptance' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/users/{id}/invitation-deliveries', tags: ['Users'], summary: 'Send a replacement invitation for an unaccepted account',
    security: [{ bearerAuth: [] }], request: { params: userIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_202_ACCEPTED]: { description: 'Invitation replaced and delivery attempted', content: { 'application/json': { schema: deliveryResponse } } },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'No resendable invitation exists' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/user-invitations/accept', tags: ['Users'], summary: 'Accept a new-account invitation and set a password',
    request: { body: { required: true, content: { 'application/json': { schema: acceptNew } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Account activated; credentials are now available to the invitee', content: { 'application/json': { schema: acceptedResponse } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid invitation payload' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'Invitation is expired, revoked or already used' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Account or enterprise state no longer permits acceptance' },
    },
  });

}
