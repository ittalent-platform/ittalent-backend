import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  applicationStatuses,
  APPLICATION_REASON_MAX_LENGTH,
  type ApplicationStatus,
} from '../../models/application.model.js';
import { paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_MESSAGES,
  APPLICATION_SORT_FIELDS,
  APPLICATION_SORT_ORDERS,
  HISTORY_ACTOR_ROLES,
  REVIEW_STAGES,
} from './applications.constants.js';

// strictObject: the client cannot smuggle in fields such as applicant_id or status (BR-7).
export const createApplicationBodySchema = z.strictObject({
  jobPostingId: objectIdSchema('job posting ID'),
  cvId: objectIdSchema('CV ID'),
  coverLetterId: objectIdSchema('cover letter ID').optional(),
  message: z
    .string()
    .trim()
    .max(APPLICATION_CONFIG.MESSAGE_MAX_LENGTH, `Message cannot exceed ${APPLICATION_CONFIG.MESSAGE_MAX_LENGTH} characters`)
    .optional(),
});

export type CreateApplicationBody = z.infer<typeof createApplicationBodySchema>;

export const applicationDtoSchema = z.object({
  id: z.string(),
  jobPostingId: z.string(),
  status: z.string(),
  cvId: z.string(),
  coverLetterId: z.string().nullable(),
  message: z.string().nullable(),
  // BR-APP-010: read-only links between a closed application and the one that replaced it.
  reappliedFrom: z.string().nullable(),
  reappliedAs: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ApplicationDTO = z.infer<typeof applicationDtoSchema>;

// ---- UC-MYAPP-01..05: the candidate's own applications (list, detail, history, withdraw) ----

export const applicationIdParamSchema = z.object({ id: objectIdSchema('application ID') });
export type ApplicationIdParam = z.infer<typeof applicationIdParamSchema>;

// `status` accepts one value or a comma-separated list ("submitted,under_review") for multi-select filters.
export function parseStatusFilter(value: string): ApplicationStatus[] {
  return value.split(APPLICATION_CONFIG.STATUS_FILTER_SEPARATOR).map((item) => item.trim()) as ApplicationStatus[];
}

const statusFilterSchema = z.string().refine(
  (value) => parseStatusFilter(value).every((item) => (applicationStatuses as readonly string[]).includes(item)),
  APPLICATION_MESSAGES.INVALID_STATUS_FILTER,
);

export const applicationListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  status: statusFilterSchema.optional(),
  sortBy: z.enum(APPLICATION_SORT_FIELDS).default('submittedAt'),
  sortOrder: z.enum(APPLICATION_SORT_ORDERS).default('desc'),
  jobId: objectIdSchema('job ID').optional(),
  reviewStage: z.enum(REVIEW_STAGES).optional(),
  search: z
    .string()
    .trim()
    .min(APPLICATION_CONFIG.KEYWORD_MIN_LENGTH, 'Search keyword must not be empty')
    .max(APPLICATION_CONFIG.KEYWORD_MAX_LENGTH, `Search keyword cannot exceed ${APPLICATION_CONFIG.KEYWORD_MAX_LENGTH} characters`)
    .optional(),
  submittedFrom: z.coerce.date().optional(),
  submittedTo: z.coerce.date().optional(),
});

// Cross-field validation lives outside the base object so OpenAPI keeps a plain object shape.
export const applicationListQueryValidator = applicationListQuerySchema.superRefine((data, ctx) => {
  if (data.submittedFrom && data.submittedTo && data.submittedFrom > data.submittedTo) {
    ctx.addIssue({ code: 'custom', message: 'submittedFrom must not be later than submittedTo', path: ['submittedTo'] });
  }
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const applicationHistoryQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(APPLICATION_CONFIG.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(APPLICATION_CONFIG.HISTORY_MAX_LIMIT).default(APPLICATION_CONFIG.HISTORY_DEFAULT_LIMIT),
});
export type ApplicationHistoryQuery = z.infer<typeof applicationHistoryQuerySchema>;

// expectedVersion is the number of history entries the client saw (BR-APP-005: history is append-only).
export const withdrawApplicationBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().max(APPLICATION_REASON_MAX_LENGTH).optional(),
});
export type WithdrawApplicationBody = z.infer<typeof withdrawApplicationBodySchema>;

const jobSnapshotDtoSchema = z.object({
  title: z.string(),
  companyName: z.string(),
  location: z.string().nullable(),
  jobType: z.string().nullable(),
  deadline: z.string().nullable(),
  publicStatus: z.string(),
});
const attachmentDtoSchema = z.object({
  documentId: z.string(),
  type: z.enum(['cv', 'cover_letter']),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  submittedAt: z.string(),
});
export const applicationSummaryDtoSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  job: jobSnapshotDtoSchema,
  status: z.enum(applicationStatuses),
  reviewStage: z.enum(REVIEW_STAGES).nullable(),
  submittedDocuments: z.array(z.enum(['cv', 'cover_letter'])),
  canWithdraw: z.boolean(),
  canApplyAgain: z.boolean(),
  reappliedFrom: z.string().nullable(),
  reappliedAs: z.string().nullable(),
  submittedAt: z.string(),
  latestStatusAt: z.string(),
  withdrawnAt: z.string().nullable(),
});
export const applicationDetailDtoSchema = applicationSummaryDtoSchema.extend({
  message: z.string().nullable(),
  withdrawalReason: z.string().nullable(),
  attachments: z.array(attachmentDtoSchema),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const applicationHistoryEntryDtoSchema = z.object({
  status: z.enum(applicationStatuses),
  reviewStage: z.enum(REVIEW_STAGES).nullable(),
  actorRole: z.enum(HISTORY_ACTOR_ROLES),
  occurredAt: z.string(),
});
const pageShape = { page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number() };
export const applicationListResponseSchema = z.object({
  ...pageShape,
  items: z.array(applicationSummaryDtoSchema),
  statusCounts: z.object(Object.fromEntries(applicationStatuses.map((status) => [status, z.number()])) as Record<ApplicationStatus, z.ZodNumber>),
});
export const applicationHistoryResponseSchema = z.object({ ...pageShape, items: z.array(applicationHistoryEntryDtoSchema) });

export type ApplicationSummaryDTO = z.infer<typeof applicationSummaryDtoSchema>;
export type ApplicationDetailDTO = z.infer<typeof applicationDetailDtoSchema>;
export type ApplicationHistoryEntryDTO = z.infer<typeof applicationHistoryEntryDtoSchema>;
export type ApplicationListResponse = z.infer<typeof applicationListResponseSchema>;
export type ApplicationHistoryResponse = z.infer<typeof applicationHistoryResponseSchema>;
