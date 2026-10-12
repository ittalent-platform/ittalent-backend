import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { userIdParamSchema, updateUserEmailBodySchema } from '../users/users.schemas.js';
import { confirmUserEmailChangeSchema } from './user-email-changes.schemas.js';

export function registerUserEmailChangesOpenApi(registry: OpenAPIRegistry): void {
  const request = registry.register('RequestUserEmailChange', updateUserEmailBodySchema);
  const confirm = registry.register('ConfirmUserEmailChange', confirmUserEmailChangeSchema);

  registry.registerPath({
    method: 'post', path: '/api/v1/users/{id}/email-change-requests', tags: ['Users'],
    summary: 'Request a user email change; the account owner must confirm it', security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema, body: { required: true, content: { 'application/json': { schema: request } } } },
    responses: {
      [HTTP_STATUS.HTTP_202_ACCEPTED]: { description: 'Request saved; email delivery was attempted' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid email or version' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'User not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Email is already used or account version is stale' },
    },
  });

  registry.registerPath({
    method: 'post', path: '/api/v1/user-email-changes/confirm', tags: ['Users'],
    summary: 'Confirm a requested email change as the account owner', security: [{ bearerAuth: [] }],
    request: { body: { required: true, content: { 'application/json': { schema: confirm } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Email changed; old sessions and pending identity tokens are invalidated' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid confirmation payload' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Request belongs to another user or current password is invalid' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Email conflict or stale account version' },
      [HTTP_STATUS.HTTP_410_GONE]: { description: 'Request is expired, revoked or already completed' },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: { description: 'Too many failed confirmation attempts for this account or IP' },
    },
  });
}
