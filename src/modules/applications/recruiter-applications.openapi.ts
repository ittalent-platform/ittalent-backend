import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  recruiterApplicationListQuerySchema,
  recruiterApplicationListResponseSchema,
  recruiterApplicationSummaryDtoSchema,
  recruiterNextInterviewDtoSchema,
} from './recruiter-applications.schemas.js';

export function registerRecruiterApplicationsOpenApi(
  registry: OpenAPIRegistry,
): void {
  registry.register('RecruiterNextInterviewDTO', recruiterNextInterviewDtoSchema);
  registry.register(
    'RecruiterApplicationSummaryDTO',
    recruiterApplicationSummaryDtoSchema,
  );
  const registeredListResponse = registry.register(
    'RecruiterApplicationListResponse',
    recruiterApplicationListResponseSchema,
  );

  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/applications',
    tags: ['Recruiter Applications'],
    summary: 'View applicant application list (with search, filter, and board counts)',
    description:
      'Recruiter and Enterprise Admin only. Returns paginated applicant applications submitted ' +
      'to job postings owned by the caller\'s enterprise. Supports keyword search across applicant name/email, ' +
      'job title, or application ID, multi-status filters, document type filters, and submission date ranges.',
    security: [{ bearerAuth: [] }],
    request: {
      query: recruiterApplicationListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated recruiter applications list with status counts',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed (e.g. invalid status name, malformed ObjectId, or invalid date range)',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description:
          'Caller is not a recruiter/enterprise administrator or lacks active enterprise assignment',
      },
    },
  });
}
