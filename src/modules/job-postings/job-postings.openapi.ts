import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createJobPostingSchema,
  jobPostingEnterpriseSummarySchema,
  jobPostingIdParamSchema,
  jobPostingListQuerySchema,
  jobPostingListResponseSchema,
  jobPostingResponseSchema,
  updateJobPostingSchema,
} from './job-postings.schemas.js';

export function registerJobPostingsOpenApi(registry: OpenAPIRegistry): void {
  registry.register('JobPostingEnterpriseSummary', jobPostingEnterpriseSummarySchema);
  const response = registry.register('JobPosting', jobPostingResponseSchema);
  const createRequest = registry.register('CreateJobPostingRequest', createJobPostingSchema);
  const updateRequest = registry.register('UpdateJobPostingRequest', updateJobPostingSchema);
  const listQuery = registry.register('JobPostingListQuery', jobPostingListQuerySchema);
  const paginated = registry.register('PaginatedJobPostings', jobPostingListResponseSchema);
  const managementAuthErrors = {
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Caller lacks the required role or cannot manage this job posting' },
  };
  registry.registerPath({ method: 'get', path: '/api/v1/job-postings', tags: ['Job Postings'], summary: 'List published job postings', request: { query: listQuery }, responses: { [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated published job postings', content: { 'application/json': { schema: paginated } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid list filter, sort, or pagination value' } } });
  registry.registerPath({ method: 'get', path: '/api/v1/recruiter/job-postings', tags: ['Job Postings'], summary: "List the recruiter's enterprise job postings", security: [{ bearerAuth: [] }], request: { query: listQuery }, responses: { [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated job postings for the recruiter enterprise', content: { 'application/json': { schema: paginated } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid list filter, sort, or pagination value' }, ...managementAuthErrors } });
  registry.registerPath({ method: 'get', path: '/api/v1/admin/job-postings', tags: ['Job Postings'], summary: 'List all job postings for administrators', security: [{ bearerAuth: [] }], request: { query: listQuery }, responses: { [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated job postings across all enterprises', content: { 'application/json': { schema: paginated } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid list filter, sort, or pagination value' }, [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' }, [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator role required' } } });
  registry.registerPath({ method: 'post', path: '/api/v1/job-postings', tags: ['Job Postings'], summary: 'Create a job posting for the authenticated recruiter enterprise', security: [{ bearerAuth: [] }], request: { body: { required: true, content: { 'application/json': { schema: createRequest } } } }, responses: { [HTTP_STATUS.HTTP_201_CREATED]: { description: 'Job posting created', content: { 'application/json': { schema: response } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job posting payload' }, ...managementAuthErrors } });
  registry.registerPath({ method: 'get', path: '/api/v1/job-postings/{id}', tags: ['Job Postings'], summary: 'Get a job posting for management', security: [{ bearerAuth: [] }], request: { params: jobPostingIdParamSchema }, responses: { [HTTP_STATUS.HTTP_200_OK]: { description: 'Job posting', content: { 'application/json': { schema: response } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job posting ID' }, [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Job posting not found' }, ...managementAuthErrors } });
  registry.registerPath({ method: 'patch', path: '/api/v1/job-postings/{id}', tags: ['Job Postings'], summary: 'Update a job posting for management', description: 'Omit a field to leave it unchanged. Send null to clear a clearable optional field.', security: [{ bearerAuth: [] }], request: { params: jobPostingIdParamSchema, body: { required: true, content: { 'application/json': { schema: updateRequest } } } }, responses: { [HTTP_STATUS.HTTP_200_OK]: { description: 'Job posting updated', content: { 'application/json': { schema: response } } }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job posting ID or update payload' }, [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Job posting not found' }, ...managementAuthErrors } });
  registry.registerPath({ method: 'delete', path: '/api/v1/job-postings/{id}', tags: ['Job Postings'], summary: 'Delete a job posting for management', description: 'A job posting cannot be deleted while one or more applications reference it.', security: [{ bearerAuth: [] }], request: { params: jobPostingIdParamSchema }, responses: { [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Job posting deleted' }, [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job posting ID' }, [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Job posting not found' }, [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Cannot delete job posting because applications already exist' }, ...managementAuthErrors } });
}
