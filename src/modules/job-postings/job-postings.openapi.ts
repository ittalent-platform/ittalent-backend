import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createJobPostingSchema,
  jobPostingEnterpriseSummarySchema,
  jobPostingHistoryQuerySchema,
  jobPostingHistoryResponseSchema,
  jobPostingIdParamSchema,
  jobPostingListQuerySchema,
  jobPostingListResponseSchema,
  jobPostingResponseSchema,
  updateJobPostingSchema,
} from './job-postings.schemas.js';

export function registerJobPostingsOpenApi(registry: OpenAPIRegistry): void {
  registry.register(
    'JobPostingEnterpriseSummary',
    jobPostingEnterpriseSummarySchema,
  );
  const response = registry.register('JobPosting', jobPostingResponseSchema);
  const createRequest = registry.register(
    'CreateJobPostingRequest',
    createJobPostingSchema,
  );
  const updateRequest = registry.register(
    'UpdateJobPostingRequest',
    updateJobPostingSchema,
  );
  const listQuery = registry.register(
    'JobPostingListQuery',
    jobPostingListQuerySchema,
  );
  const paginated = registry.register(
    'PaginatedJobPostings',
    jobPostingListResponseSchema,
  );
  const history = registry.register(
    'JobPostingHistory',
    jobPostingHistoryResponseSchema,
  );
  const managementAuthErrors = {
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
      description: 'Authentication required',
    },
    [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
      description:
        'Caller lacks the required role or cannot manage this job posting',
    },
  };
  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings',
    tags: ['Job Postings'],
    summary: 'List published job postings',
    request: { query: listQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated published job postings',
        content: { 'application/json': { schema: paginated } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid list filter, sort, or pagination value',
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings/{id}/public',
    tags: ['Job Postings'],
    summary: 'Get a published, still-open job posting (public)',
    description:
      'Not found for drafts, archived or expired postings, postings being deleted and postings of enterprises that are not Active.',
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting ID',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found, not published, or no longer open',
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/recruiter/job-postings',
    tags: ['Job Postings'],
    summary: "List the recruiter's enterprise job postings",
    security: [{ bearerAuth: [] }],
    request: { query: listQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated job postings for the recruiter enterprise',
        content: { 'application/json': { schema: paginated } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid list filter, sort, or pagination value',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/admin/job-postings',
    tags: ['Job Postings'],
    summary: 'List all job postings for administrators',
    security: [{ bearerAuth: [] }],
    request: { query: listQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated job postings across all enterprises',
        content: { 'application/json': { schema: paginated } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid list filter, sort, or pagination value',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Administrator role required',
      },
    },
  });
  registry.registerPath({
    method: 'post',
    path: '/api/v1/job-postings',
    tags: ['Job Postings'],
    summary: 'Create a job posting for the authenticated recruiter enterprise',
    description:
      'Defaults to Published for backward compatibility. Send publication_status=draft to save an incomplete internal draft. Published postings require all public fields and an Active enterprise.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: createRequest } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Job posting created',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting payload',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings/{id}',
    tags: ['Job Postings'],
    summary:
      'Get a job posting for management (recruiter of the owning enterprise, or admin read-only)',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting ID',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/job-postings/{id}',
    tags: ['Job Postings'],
    summary: 'Update, publish, or move a job posting to draft',
    description:
      'Recruiters of the owning enterprise only. publication_status accepts draft or published. Publishing validates all required public fields; archived postings must be restored first.',
    security: [{ bearerAuth: [] }],
    request: {
      params: jobPostingIdParamSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: updateRequest } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job posting updated',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting ID or update payload',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Archived posting cannot be edited',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/job-postings/{id}/close',
    tags: ['Job Postings'],
    summary: 'Close an open published job posting',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Closed job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Invalid lifecycle transition',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/job-postings/{id}/reopen',
    tags: ['Job Postings'],
    summary: 'Reopen a closed job posting',
    description:
      'The enterprise must be Active and the deadline must still be in the future.',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Reopened job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Invalid lifecycle transition or expired deadline',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/job-postings/{id}/archive',
    tags: ['Job Postings'],
    summary: 'Archive a closed job posting',
    description: 'Idempotent when the posting is already archived.',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Archived job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Only a closed posting can be archived',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/job-postings/{id}/restore',
    tags: ['Job Postings'],
    summary: 'Restore an archived job posting as closed',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Restored closed job posting',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Only an archived posting can be restored',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/job-postings/{id}/history',
    tags: ['Job Postings'],
    summary: 'View job posting audit history',
    security: [{ bearerAuth: [] }],
    request: {
      params: jobPostingIdParamSchema,
      query: jobPostingHistoryQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated job posting history',
        content: { 'application/json': { schema: history } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      ...managementAuthErrors,
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/job-postings/{id}',
    tags: ['Job Postings'],
    summary: 'Delete a job posting for management',
    description:
      'Recruiters of the owning enterprise only. Hard-removes the posting in any state, and only while no application has ever been recorded for it.',
    security: [{ bearerAuth: [] }],
    request: { params: jobPostingIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Job posting deleted' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid job posting ID',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Job posting not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description:
          'Cannot delete job posting because applications already exist (or it is already being deleted)',
      },
      ...managementAuthErrors,
    },
  });
}
