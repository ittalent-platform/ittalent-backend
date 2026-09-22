import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { healthResponseSchema } from './health.schema.js';

export function registerHealthOpenApi(registry: OpenAPIRegistry): void {
  const registeredHealthResponseSchema = registry.register('HealthResponse', healthResponseSchema);

  registry.registerPath({
    method: 'get',
    path: '/health',
    tags: ['Health'],
    summary: 'Service health check',
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: registeredHealthResponseSchema,
          },
        },
      },
    },
  });
}
