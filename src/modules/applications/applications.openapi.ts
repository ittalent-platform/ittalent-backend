import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { applicationDtoSchema, createApplicationBodySchema } from './applications.schemas.js';

export function registerApplicationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredBody = registry.register('CreateApplicationRequest', createApplicationBodySchema);
  const registeredDto = registry.register('ApplicationDTO', applicationDtoSchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/applications',
    tags: ['Applications'],
    summary: 'Apply for a job',
    description:
      'Applicant only. Requires a verified email, a saved applicant profile and a Published + Open job. ' +
      'Re-applying after a Withdrawn/Rejected application reactivates the old record.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: registeredBody } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Application submitted',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed (bad IDs, message too long, CV/cover letter not available)',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Email not verified, account not active, or caller is not an Applicant',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job not found / no longer available, or applicant profile missing',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Duplicate application, or the position has been filled',
      },
    },
  });
}