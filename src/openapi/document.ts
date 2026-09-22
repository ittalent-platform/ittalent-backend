import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { env } from '../config/env.js';
import { registry } from './registry.js';

export function createOpenApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'Express Template API',
      version: '1.0.0',
      description: 'API documentation for Express Template.',
    },
    servers: [
      {
        url: env.OPENAPI_SERVER_URL ?? `http://localhost:${env.PORT}`,
      },
    ],
  });
}

export const openApiDocument = createOpenApiDocument();
