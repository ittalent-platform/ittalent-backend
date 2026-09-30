import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  applicationHistoryQuerySchema,
  applicationIdParamSchema,
  applicationListQuerySchema,
  withdrawApplicationBodySchema,
} from './applications.schemas.js';
import { applicationActorRoles, applicationAttachmentTypes, applicationReviewStages, applicationStatuses, type ApplicationStatus, type ApplicationReviewStage, type ApplicationAttachmentType, type ApplicationActorRole } from '../../models/application.model.js';

export interface JobSnapshotResponse { title: string; companyName: string; location: string | null; jobType: string | null; deadline: string | null; publicStatus: string }
export interface AttachmentSnapshotResponse { documentId: string; type: ApplicationAttachmentType; fileName: string; mimeType: string; size: number; submittedAt: string }
export interface ApplicationSummaryDTO { id: string; jobId: string; job: JobSnapshotResponse; status: ApplicationStatus; reviewStage: ApplicationReviewStage | null; submittedDocuments: ApplicationAttachmentType[]; canWithdraw: boolean; canApplyAgain: boolean; reappliedFrom: string | null; reappliedAs: string | null; submittedAt: string; latestStatusAt: string; withdrawnAt: string | null }
export interface ApplicationDetailDTO extends ApplicationSummaryDTO { message: string | null; withdrawalReason: string | null; attachments: AttachmentSnapshotResponse[]; version: number; createdAt: string; updatedAt: string }
export interface ApplicationHistoryEntryDTO { status: ApplicationStatus; reviewStage: ApplicationReviewStage | null; actorRole: ApplicationActorRole; occurredAt: string }
export interface ApplicationListResponse { items: ApplicationSummaryDTO[]; page: number; limit: number; total: number; totalPages: number; statusCounts: Record<ApplicationStatus, number> }

export function registerApplicationsOpenApi(registry: OpenAPIRegistry): void {
  const job = z.object({ title: z.string(), companyName: z.string(), location: z.string().nullable(), jobType: z.string().nullable(), deadline: z.string().nullable(), publicStatus: z.string() });
  const attachment = z.object({ documentId: z.string(), type: z.enum(applicationAttachmentTypes), fileName: z.string(), mimeType: z.string(), size: z.number(), submittedAt: z.string() });
  const summary = z.object({ id: z.string(), jobId: z.string(), job, status: z.enum(applicationStatuses), reviewStage: z.enum(applicationReviewStages).nullable(), submittedDocuments: z.array(z.enum(applicationAttachmentTypes)), canWithdraw: z.boolean(), canApplyAgain: z.boolean(), reappliedFrom: z.string().nullable(), reappliedAs: z.string().nullable(), submittedAt: z.string(), latestStatusAt: z.string(), withdrawnAt: z.string().nullable() });
  const registeredDetail = registry.register('ApplicationDetailDTO', summary.extend({ message: z.string().nullable(), withdrawalReason: z.string().nullable(), attachments: z.array(attachment), version: z.number(), createdAt: z.string(), updatedAt: z.string() }));
  const historyEntry = z.object({ status: z.enum(applicationStatuses), reviewStage: z.enum(applicationReviewStages).nullable(), actorRole: z.enum(applicationActorRoles), occurredAt: z.string() });
  const page = { page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number() };
  const registeredListResponse = registry.register('ApplicationListResponse', z.object({ ...page, items: z.array(summary), statusCounts: z.object(Object.fromEntries(applicationStatuses.map((status) => [status, z.number()])) as Record<(typeof applicationStatuses)[number], z.ZodNumber>) }));
  const registeredHistoryResponse = registry.register('ApplicationHistoryResponse', z.object({ ...page, items: z.array(historyEntry) }));
  const registeredWithdrawBody = registry.register('WithdrawApplicationBody', withdrawApplicationBodySchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications',
    tags: ['Applications'],
    summary: 'View the authenticated candidate applications list with filtering and pagination',
    description:
      'Returns a bounded, newest-first list of the candidate’s own applications. Supports filtering by one or several statuses (comma-separated), job ID, review stage, date range, and keyword search on the job title or company name, sorted by submitted date, last update or ID. Also returns status counts for board-like views over the same filter set (UC-MYAPP-01.AC.3).',
    security: [{ bearerAuth: [] }],
    request: { query: applicationListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated application list with status counts',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid or contradictory filter values',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: candidate role required',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications/{id}',
    tags: ['Applications'],
    summary: 'View an owned application detail',
    description: 'Returns the detail of a single application owned by the authenticated candidate. Public job snapshot and attachment metadata are included; no private HR data or document URLs are exposed.',
    security: [{ bearerAuth: [] }],
    request: { params: applicationIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Application detail',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid application ID format',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Application not found or not owned by the candidate',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: candidate role required',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/applications/{id}/history',
    tags: ['Applications'],
    summary: 'View the history of an owned application',
    description:
      'Returns the append-only status history for an application owned by the authenticated candidate. Each entry contains public status, timestamp, stage, and actor role only. No private notes, interviewer identities, or company-internal fields are exposed.',
    security: [{ bearerAuth: [] }],
    request: { params: applicationIdParamSchema, query: applicationHistoryQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated application history',
        content: { 'application/json': { schema: registeredHistoryResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid application ID format',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Application not found or not owned by the candidate',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: candidate role required',
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/applications/{id}/withdraw',
    tags: ['Applications'],
    summary: 'Withdraw an owned application',
    description:
      'Withdraws an owned application if it is currently in Submitted or Under Review status. Uses optimistic concurrency via expectedVersion and records the withdrawal as an append-only history event. The Withdrawn status is terminal.',
    security: [{ bearerAuth: [] }],
    request: {
      params: applicationIdParamSchema,
      body: {
        content: {
          'application/json': { schema: registeredWithdrawBody },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Application detail after withdrawal',
        content: { 'application/json': { schema: registeredDetail } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Validation failed: application not in withdrawable state, reason too long, or missing expectedVersion',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Forbidden: candidate role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Application not found or not owned by the candidate',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Concurrent modification: the expectedVersion did not match the current application version',
      },
    },
  });
}
