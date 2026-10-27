import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  adminReportsQuerySchema,
  adminResolveReportSchema,
  createReportSchema,
  reporterReportsQuerySchema,
  reportIdParamSchema,
  withdrawReportSchema,
} from './reports.schemas.js';

export function registerReportsOpenApi(registry: OpenAPIRegistry): void {
  const createSchema = registry.register('CreateReportRequest', createReportSchema);
  const withdrawSchema = registry.register('WithdrawReportRequest', withdrawReportSchema);
  const resolveSchema = registry.register('AdminResolveReportRequest', adminResolveReportSchema);

  // Reporter Report Item Schema
  const reporterReportItemSchema = z.object({
    id: z.string(),
    ticket_id: z.string(),
    target_type: z.string(),
    target_id: z.string(),
    target_title: z.string(),
    target_link: z.string().nullable().optional(),
    reason_category: z.string(),
    title: z.string(),
    description: z.string(),
    evidence_files: z.array(z.string()),
    is_anonymous: z.boolean(),
    status: z.string(),
    withdrawal_reason: z.string().nullable().optional(),
    withdrawn_at: z.string().nullable().optional(),
    resolution_decision: z.string().nullable().optional(),
    action_taken: z.string().nullable().optional(),
    message_to_reporter: z.string().nullable().optional(),
    resolved_at: z.string().nullable().optional(),
    timeline: z.array(
      z.object({
        status: z.string(),
        timestamp: z.string(),
        note: z.string().nullable().optional(),
      }),
    ),
    createdAt: z.string(),
    updatedAt: z.string(),
  });

  const reporterListResponseSchema = z.object({
    success: z.boolean(),
    items: z.array(reporterReportItemSchema),
    kpis: z.object({
      total: z.number(),
      pending: z.number(),
      reviewing: z.number(),
      resolved: z.number(),
      rejected: z.number(),
      withdrawn: z.number(),
    }),
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  });

  // UC-30: Create Report
  registry.registerPath({
    method: 'post',
    path: '/api/v1/reports',
    tags: ['Reports - Reporter'],
    summary: 'Submit a violation report (UC-30)',
    description:
      'File a formal violation report against a target entity (job listing, company profile, or user) with category, statement, and evidence attachments.',
    security: [{ bearerAuth: [] }],
    request: {
      body: { required: true, content: { 'application/json': { schema: createSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Report created successfully',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), data: reporterReportItemSchema }),
          },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Self-reporting attempt or duplicate pending report in 24h' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Target entity not found' },
    },
  });

  // UC-31: List Reporter Reports
  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports',
    tags: ['Reports - Reporter'],
    summary: 'View submitted reports history (UC-31)',
    description: 'Retrieve paginated history of reports submitted by the authenticated user.',
    security: [{ bearerAuth: [] }],
    request: {
      query: reporterReportsQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Reports retrieved successfully',
        content: { 'application/json': { schema: reporterListResponseSchema } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  // UC-32: View Reporter Report Detail
  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/reports/{id}',
    tags: ['Reports - Reporter'],
    summary: 'View report detail (UC-32)',
    description: 'Inspect complete detail and progress timeline of a submitted report.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report detail retrieved successfully',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), data: reporterReportItemSchema }),
          },
        },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });

  // UC-33: Withdraw Report
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/reports/{id}/withdraw',
    tags: ['Reports - Reporter'],
    summary: 'Withdraw a pending report (UC-33)',
    description: 'Retract an active violation report before administrators have initiated formal review.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
      body: { required: false, content: { 'application/json': { schema: withdrawSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report withdrawn successfully',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              data: reporterReportItemSchema,
            }),
          },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Report is not in pending status' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });

  // UC-34: Delete Report
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/reports/{id}',
    tags: ['Reports - Reporter'],
    summary: 'Delete report from personal history (UC-34)',
    description: 'Hide a terminal status report from personal history view while retaining audit records.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Report removed from history successfully',
        content: {
          'application/json': {
            schema: z.object({ success: z.boolean(), message: z.string() }),
          },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Active reports cannot be deleted' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });

  // UC-35: Admin List Reports
  registry.registerPath({
    method: 'get',
    path: '/api/v1/admin/reports',
    tags: ['Reports - Admin'],
    summary: 'View violation reports queue (UC-35)',
    description: 'Centralized administrator review queue of all submitted violation reports.',
    security: [{ bearerAuth: [] }],
    request: {
      query: adminReportsQuerySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Reports queue retrieved successfully',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });

  // UC-36: Admin Report Detail
  registry.registerPath({
    method: 'get',
    path: '/api/v1/admin/reports/{id}',
    tags: ['Reports - Admin'],
    summary: 'View report investigation workbench (UC-36)',
    description: 'Full investigation view for administrators with reporter details and internal notes.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Investigation details retrieved successfully',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Report not found' },
    },
  });

  // UC-36: Admin Claim Ticket
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/admin/reports/{id}/claim',
    tags: ['Reports - Admin'],
    summary: 'Claim report ticket (UC-36)',
    description: 'Assign report ticket to current administrator and advance status to reviewing.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Ticket claimed successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Ticket cannot be claimed' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });

  // UC-36: Admin Resolve Ticket
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/admin/reports/{id}/resolve',
    tags: ['Reports - Admin'],
    summary: 'Finalize report resolution (UC-36)',
    description: 'Execute decisive resolution with atomic enforcement actions, internal notes, and reporter message.',
    security: [{ bearerAuth: [] }],
    request: {
      params: reportIdParamSchema,
      body: { required: true, content: { 'application/json': { schema: resolveSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Resolution finalized successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Ticket already resolved or invalid parameters' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Admin privileges required' },
    },
  });
}
