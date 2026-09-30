import './zod.js';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { registerApplicationsOpenApi } from '../modules/applications/applications.openapi.js';
import { registerAuthOpenApi } from '../modules/auth/auth.openapi.js';
import { registerDocumentsOpenApi } from '../modules/documents/documents.openapi.js';
import { registerEnterprisesOpenApi } from '../modules/enterprises/enterprises.openapi.js';
import { registerHealthOpenApi } from '../modules/health/health.openapi.js';
import { registerJobPostingsOpenApi } from '../modules/job-postings/job-postings.openapi.js';
import { registerUsersOpenApi } from '../modules/users/users.openapi.js';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registerHealthOpenApi(registry);
registerAuthOpenApi(registry);
registerDocumentsOpenApi(registry);
registerJobPostingsOpenApi(registry);
registerUsersOpenApi(registry);
registerEnterprisesOpenApi(registry);
registerApplicationsOpenApi(registry);
