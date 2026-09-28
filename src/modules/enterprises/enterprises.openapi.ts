import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  enterpriseDetailSchema,
  enterpriseIdParamSchema,
  enterpriseListQuerySchema,
  enterpriseListResponseSchema,
} from './enterprises.schemas.js';

export function registerEnterprisesOpenApi(registry: OpenAPIRegistry): void {
  const registeredListResponse = registry.register('EnterpriseListResponse', enterpriseListResponseSchema);
  const registeredDetail = registry.register('EnterpriseDetailDTO', enterpriseDetailSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises',
    tags: ['Enterprises'],
    summary: 'View enterprise list / search enterprises',
    description:
      'Public. Returns only Active enterprises. Optional keyword (matches name, industry, location), industry and location narrow the list.',
    request: {
      query: enterpriseListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated list of active enterprises (empty items when nothing matches)',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid or unsupported query parameters',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/enterprises/{enterpriseId}',
    tags: ['Enterprises'],
    summary: 'View enterprise detail',
    description: 'Public. Returns 404 when the enterprise does not exist or is not Active.',
    request: {
      params: enterpriseIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Public enterprise details',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid enterprise ID',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Enterprise not found',
      },
    },
  });
}