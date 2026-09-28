import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  jobPostingDetailSchema,
  jobPostingIdParamSchema,
  jobPostingListQuerySchema,
  jobPostingListResponseSchema,
} from './job-postings.schemas.js';

export function registerJobPostingsOpenApi(registry: OpenAPIRegistry): void {
  const registeredListResponse = registry.register('JobPostingListResponse', jobPostingListResponseSchema);
  const registeredDetail = registry.register('JobPostingDetailDTO', jobPostingDetailSchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings',
    tags: ['Job Postings'],
    summary: 'View job list',
    description: 'Public. Returns only Published + Open job postings, newest first.',
    request: {
      query: jobPostingListQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated list of public job postings (empty items when none are open)',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid or unsupported query parameters',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings/{jobPostingId}',
    tags: ['Job Postings'],
    summary: 'View job detail',
    description: 'Public. Returns 404 when the job does not exist, is a Draft, or is Closed.',
    request: {
      params: jobPostingIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Public job posting details',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting ID',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job not found',
      },
    },
  });
}