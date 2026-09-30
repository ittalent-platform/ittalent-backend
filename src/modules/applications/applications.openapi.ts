import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  applicationDetailDtoSchema,
  applicationDtoSchema,
  applicationHistoryQuerySchema,
  applicationHistoryResponseSchema,
  applicationIdParamSchema,
  applicationListQuerySchema,
  applicationListResponseSchema,
  createApplicationBodySchema,
  withdrawApplicationBodySchema,
} from './applications.schemas.js';

export function registerApplicationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredBody = registry.register('CreateApplicationRequest', createApplicationBodySchema);
  const registeredDto = registry.register('ApplicationDTO', applicationDtoSchema);
  const registeredDetail = registry.register('ApplicationDetailDTO', applicationDetailDtoSchema);
  const registeredList = registry.register('ApplicationListResponse', applicationListResponseSchema);
  const registeredHistory = registry.register('ApplicationHistoryResponse', applicationHistoryResponseSchema);
  const registeredWithdrawBody = registry.register('WithdrawApplicationBody', withdrawApplicationBodySchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/applications',
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

  const candidateErrors = {
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Forbidden: applicant role required, or the account cannot be resolved to a candidate' },
  };

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications',
    tags: ['Applications'],
    summary: 'List my applications with filtering, sorting and pagination',
    description:
      'Applicant only. Returns a bounded list of the caller\'s own applications (any status), newest first by default. ' +
      'Filters: `status` (one value or a comma-separated list), `jobId`, `reviewStage`, submitted date range and a keyword on the job title or company name. ' +
      'Sort by submitted date, last update or ID. Also returns status counts over the same filters for board views (UC-MYAPP-01.AC.3).',
    security: [{ bearerAuth: [] }],
    request: { query: applicationListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated applications with status counts', content: { 'application/json': { schema: registeredList } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid or contradictory filter, sort or paging values' },
      ...candidateErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications/{id}',
    tags: ['Applications'],
    summary: 'View one of my applications',
    description: 'Applicant only. Public job summary, submitted attachment metadata (no file URLs), status, stage label and the reapplication links. Another candidate\'s application is indistinguishable from a missing one (404).',
    security: [{ bearerAuth: [] }],
    request: { params: applicationIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Application detail', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid application ID' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Application not found or not owned by the caller' },
      ...candidateErrors,
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications/{id}/history',
    tags: ['Applications'],
    summary: 'View the status history of one of my applications',
    description: 'Applicant only. Append-only, oldest first. Each entry has the public status, stage label, actor role (candidate, company or system) and timestamp; never account identifiers or private notes.',
    security: [{ bearerAuth: [] }],
    request: { params: applicationIdParamSchema, query: applicationHistoryQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Paginated history', content: { 'application/json': { schema: registeredHistory } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid application ID or paging values' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Application not found or not owned by the caller' },
      ...candidateErrors,
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/applications/{id}/withdraw',
    tags: ['Applications'],
    summary: 'Withdraw one of my applications',
    description:
      'Applicant only. Allowed while Submitted or Under Review; Withdrawn is closed and never reopened (a later application is a new record). ' +
      '`expectedVersion` is the version returned by the detail endpoint (the number of history entries); a stale version returns 409 and changes nothing.',
    security: [{ bearerAuth: [] }],
    request: { params: applicationIdParamSchema, body: { required: true, content: { 'application/json': { schema: registeredWithdrawBody } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Application after withdrawal', content: { 'application/json': { schema: registeredDetail } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid input, or the status is not Submitted / Under Review' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Application not found or not owned by the caller' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'The application changed after the client read it' },
      ...candidateErrors,
    },
  });
}
