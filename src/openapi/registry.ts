import './zod.js';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
  registerApplicationsOpenApi,
  registerRecruiterApplicationsOpenApi,
} from '../modules/applications/index.js';
import { registerAuthOpenApi } from '../modules/auth/auth.openapi.js';
import { registerDocumentsOpenApi } from '../modules/documents/documents.openapi.js';
import { registerEnterprisesOpenApi } from '../modules/enterprises/enterprises.openapi.js';
import { registerEnterpriseRegistrationsOpenApi } from '../modules/enterprise-registrations/enterprise-registrations.openapi.js';
import { registerHealthOpenApi } from '../modules/health/health.openapi.js';
import { registerInterviewsOpenApi } from '../modules/interviews/interviews.openapi.js';
import { registerJobPostingsOpenApi } from '../modules/job-postings/job-postings.openapi.js';
import { registerUsersOpenApi } from '../modules/users/users.openapi.js';
import { registerUserInvitationsOpenApi } from '../modules/user-invitations/user-invitations.openapi.js';
import { registerUserAuditsOpenApi } from '../modules/user-audits/user-audits.openapi.js';
import { registerUserEmailChangesOpenApi } from '../modules/user-email-changes/user-email-changes.openapi.js';

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
registerUserInvitationsOpenApi(registry);
registerUserAuditsOpenApi(registry);
registerUserEmailChangesOpenApi(registry);
registerEnterprisesOpenApi(registry);
registerEnterpriseRegistrationsOpenApi(registry);
registerApplicationsOpenApi(registry);
registerRecruiterApplicationsOpenApi(registry);
registerInterviewsOpenApi(registry);
