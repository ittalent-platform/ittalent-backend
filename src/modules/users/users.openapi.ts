import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { userDtoSchema, userIdParamSchema } from './users.schemas.js';

export function registerUsersOpenApi(registry: OpenAPIRegistry): void {
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}',
    tags: ['Users'],
    summary: 'Get user by ID',
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
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'User not found',
      },
    },
  });
}
