import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  adminReportsQuerySchema,
  adminResolveReportSchema,
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
  const resolveSchema = registry.register('AdminResolveReportRequest', adminResolveReportSchema);

  // --- Applicant / Candidate Routes (/api/v1/me/reports) ---

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/reports',
    tags: ['Reports - Applicant'],
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
        description: 'Report submitted successfully',
        content: { 'application/json': { schema: createResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation failed or self-reporting forbidden' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Target entity not found' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports',
    tags: ['Reports - Applicant'],
    summary: 'List my submitted reports with status filters and search',
    description:
      'Returns paginated reports with category badge counts (all, open, closed) and dynamic target availability check.',
    security: [{ bearerAuth: [] }],
    request: {
      query: querySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Reports listed successfully',
        content: { 'application/json': { schema: paginatedResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Reporting is restricted to applicant accounts' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports/{id}',
    tags: ['Reports - Applicant'],
    summary: 'Get report detail by ID or reference',
    description:
      'Returns complete report ticket with target snapshot, file downloads, timeline, and current resolution response.',
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
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found or hidden' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/reports/{id}/withdraw',
    tags: ['Reports - Applicant'],
    summary: 'Withdraw a pending report',
    description:
      'Allows applicant to withdraw report if status is strictly pending. Rejects with 409 Conflict if review has started.',
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
    tags: ['Reports - Applicant'],
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

  // --- Admin Violation Investigation Routes (/api/v1/reports) ---

  registry.registerPath({
    method: 'get',
    path: '/api/v1/reports',
    tags: ['Reports - Admin'],
    summary: 'View violation reports queue (Admin)',
    description: 'Centralized administrator review queue of all submitted violation reports with KPI statistics.',
    security: [{ bearerAuth: [] }],
    request: {
      query: adminReportsQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Reports queue retrieved successfully' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/reports/{id}',
    tags: ['Reports - Admin'],
    summary: 'View report investigation workbench (Admin)',
    description: 'Full investigation view for administrators with reporter details and internal notes.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Investigation details retrieved successfully' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/reports/{id}/claim',
    tags: ['Reports - Admin'],
    summary: 'Claim report ticket (Admin)',
    description: 'Assign report ticket to current administrator and advance status to reviewing.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Ticket claimed successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Ticket cannot be claimed' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/reports/{id}/resolve',
    tags: ['Reports - Admin'],
    summary: 'Finalize report resolution (Admin)',
    description: 'Execute decisive resolution with atomic enforcement actions, internal notes, and reporter message.',
    security: [{ bearerAuth: [] }],
    request: {
      params: idParam,
      body: { required: true, content: { 'application/json': { schema: resolveSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Resolution finalized successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Ticket already resolved or invalid parameters' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });
}
