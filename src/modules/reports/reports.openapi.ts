import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  createReportBodySchema,
  createReportResponseSchema,
  paginatedReportsResponseSchema,
  reportDetailResponseSchema,
  reportHideResponseSchema,
  reportIdParamSchema,
  reportsQuerySchema,
  reportWithdrawResponseSchema,
} from './reports.schemas.js';

export function registerReportsOpenApi(registry: OpenAPIRegistry): void {
  const createSchema = registry.register('CreateReportRequest', createReportBodySchema);
  const createResponse = registry.register('CreateReportResponse', createReportResponseSchema);
  const paginatedResponse = registry.register('PaginatedReportsResponse', paginatedReportsResponseSchema);
  const detailResponse = registry.register('ReportDetailResponse', reportDetailResponseSchema);
  const withdrawResponse = registry.register('ReportWithdrawResponse', reportWithdrawResponseSchema);
  const hideResponse = registry.register('ReportHideResponse', reportHideResponseSchema);
  const idParam = registry.register('ReportIdParam', reportIdParamSchema);
  const querySchema = registry.register('ReportsQuery', reportsQuerySchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/reports',
    tags: ['Reports'],
    summary: 'Submit a violation report against a job, company, or user',
    description:
      'Submits a violation report with statement and optional evidence files. Generates reference RPT-YYYY-NNNN and snapshots target metadata. Idempotent against double-clicks.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: createSchema },
          'multipart/form-data': { schema: createSchema },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Report created successfully',
        content: { 'application/json': { schema: createResponse } },
      },
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report already submitted (idempotent)',
        content: { 'application/json': { schema: createResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation error, unsupported file type, or target unavailable',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports',
    tags: ['Reports'],
    summary: 'List my violation reports with status counts and search',
    description:
      'Retrieves candidate submitted reports (excluding hidden ones) with tab counts (all, open, closed), search matching, and dynamic target availability.',
    security: [{ bearerAuth: [] }],
    request: {
      query: querySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Candidate reports retrieved successfully',
        content: { 'application/json': { schema: paginatedResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid query parameters or unsupported filter' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports/{id}',
    tags: ['Reports'],
    summary: 'Get report detail by ID or reference',
    description:
      'Retrieves full report ticket details, evidence files, resolution feedback, and audit history timeline.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report detail retrieved successfully',
        content: { 'application/json': { schema: detailResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found or not owned by user' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/reports/{id}/withdraw',
    tags: ['Reports'],
    summary: 'Withdraw a pending report',
    description:
      'Self-withdraws a report that is currently pending review. Rejects with 409 Conflict if review has already begun.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report withdrawn successfully',
        content: { 'application/json': { schema: withdrawResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Review has already started; cannot withdraw report',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/reports/{id}/hide',
    tags: ['Reports'],
    summary: 'Hide a closed report from my history',
    description:
      'Soft-hides a closed report (resolved, rejected, or withdrawn) from candidate list and counts. Compliance records remain preserved.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report hidden successfully',
        content: { 'application/json': { schema: hideResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Report is not closed; open reports cannot be hidden',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });
}
