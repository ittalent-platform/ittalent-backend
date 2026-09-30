import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { userDtoSchema, userIdParamSchema, userListQuerySchema, userListResponseSchema } from './users.schemas.js';

export function registerUsersOpenApi(registry: OpenAPIRegistry): void {
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);
  const registeredUserList = registry.register('UserListResponse', userListResponseSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users',
    tags: ['Users'],
    summary: 'List user accounts',
    description:
      'System Administrator only (UC-USER-01). Newest first (createdAt desc, id desc). ' +
      '`search` matches username or email as literal, case-insensitive text. Only allow-listed fields are returned.',
    security: [{ bearerAuth: [] }],
    request: { query: userListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'One page of user accounts (empty items when nothing matches)',
        content: { 'application/json': { schema: registeredUserList } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid page, limit, search, role or status' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Caller is not a System Administrator' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Account storage unavailable, retry later' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}',
    tags: ['Users'],
    summary: 'Get user by ID',
    description: 'System Administrator only (UC-USER-02). Own-profile reads use GET /auth/me.',
    security: [{ bearerAuth: [] }],
    request: {
      params: userIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'User details retrieved successfully',
        content: {
          'application/json': {
            schema: registeredUserDto,
          },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid user ID',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Caller is not a System Administrator',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'User not found',
      },
    },
  });
}
