import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { userIdParamSchema } from '../users/users.schemas.js';
import { userAuditHistoryQuerySchema, userAuditHistoryResponseSchema } from './user-audits.schemas.js';

export function registerUserAuditsOpenApi(registry: OpenAPIRegistry): void {
  const response = registry.register('UserAuditHistoryResponse', userAuditHistoryResponseSchema);
  registry.registerPath({
    method: 'get',
    path: '/api/v1/users/{id}/history',
    tags: ['Users'],
    summary: 'Read safe paginated user account history',
    security: [{ bearerAuth: [] }],
    request: { params: userIdParamSchema, query: userAuditHistoryQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Append-only account history', content: { 'application/json': { schema: response } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid account ID or pagination/filter input' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active System Administrator required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Account not found' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'History store unavailable' },
    },
  });
}
