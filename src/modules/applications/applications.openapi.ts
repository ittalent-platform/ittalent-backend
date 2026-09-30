import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  applicationDtoSchema,
  createApplicationBodySchema,
  myApplicationQuerySchema,
  myApplicationResponseSchema,
} from './applications.schemas.js';

export function registerApplicationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredBody = registry.register('CreateApplicationRequest', createApplicationBodySchema);
  const registeredDto = registry.register('ApplicationDTO', applicationDtoSchema);
  const registeredMine = registry.register('MyApplicationResponse', myApplicationResponseSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/applications/mine',
    tags: ['Applications'],
    summary: 'Get my application for a job',
    description:
      'Applicant only. Returns the caller\'s latest application for the given job, or { item: null } when none exists.',
    security: [{ bearerAuth: [] }],
    request: { query: myApplicationQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'The application (any status) or null',
        content: { 'application/json': { schema: registeredMine } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job posting ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Caller is not an Applicant' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/applications',
    tags: ['Applications'],
    summary: 'Apply for a job',
    description:
      'Applicant only. Requires a verified email and a Published + Open job. ' +
      'One active application per job: after a Withdrawn or Rejected application the applicant may apply again, ' +
      'which creates a new linked record (the closed one is never reopened). At most two applications per job; ' +
      'never after Hired.',
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
        description: 'Job not found / no longer available',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description:
          'ALREADY_APPLIED (an active application exists), APPLY_AGAIN_NOT_ALLOWED (Hired, or two applications already used), or POSITION_FILLED',
      },
    },
  });
}