import { z } from 'zod';

import { applicationReviewStages, applicationStatuses, type ApplicationStatus } from '../../models/application.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_MESSAGES,
  APPLICATION_SORT_FIELDS,
  APPLICATION_SORT_ORDERS,
} from './applications.constants.js';

export const applicationIdParamSchema = z.object({
  id: objectIdSchema('application ID'),
});

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
  reviewStage: z.enum(applicationReviewStages).optional(),
  search: z
    .string()
    .trim()
    .min(APPLICATION_CONFIG.KEYWORD_MIN_LENGTH, 'Search keyword must not be empty')
    .max(APPLICATION_CONFIG.KEYWORD_MAX_LENGTH, `Search keyword cannot exceed ${APPLICATION_CONFIG.KEYWORD_MAX_LENGTH} characters`)
    .optional(),
  submittedFrom: z.coerce.date().optional(),
  submittedTo: z.coerce.date().optional(),
});

export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

// Route-level refinement for contradictory date ranges (UC-MYAPP-05.EX.3). Kept separate
// from the base object so OpenAPI keeps a plain object shape for query parameters.
export const applicationListQueryValidator = applicationListQuerySchema.superRefine((data, ctx) => {
  if (data.submittedFrom && data.submittedTo && data.submittedFrom > data.submittedTo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'submittedFrom must not be later than submittedTo',
      path: ['submittedTo'],
    });
  }
});

export const applicationHistoryQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(APPLICATION_CONFIG.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(APPLICATION_CONFIG.HISTORY_MAX_LIMIT)
    .default(APPLICATION_CONFIG.HISTORY_DEFAULT_LIMIT),
});

export type ApplicationHistoryQuery = z.infer<typeof applicationHistoryQuerySchema>;

export const withdrawApplicationBodySchema = z.object({
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().max(APPLICATION_CONFIG.REASON_MAX_LENGTH).optional(),
});

export type WithdrawApplicationBody = z.infer<typeof withdrawApplicationBodySchema>;
