import { z } from 'zod';

import {
  applicationStatuses,
  type ApplicationStatus,
} from '../../models/application.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_MESSAGES,
  APPLICATION_SORT_FIELDS,
  APPLICATION_SORT_ORDERS,
  REVIEW_STAGES,
  type ApplicationReviewStage,
} from './applications.constants.js';

export function parseRecruiterStatusFilter(value: string): ApplicationStatus[] {
  return value
    .split(APPLICATION_CONFIG.STATUS_FILTER_SEPARATOR)
    .map((item) => item.trim())
    .filter((item) => item.length > 0) as ApplicationStatus[];
}

const recruiterStatusFilterSchema = z.string().refine(
  (value) => {
    const parsed = parseRecruiterStatusFilter(value);
    return (
      parsed.length > 0 &&
      parsed.every((item) =>
        (applicationStatuses as readonly string[]).includes(item),
      )
    );
  },
  APPLICATION_MESSAGES.INVALID_STATUS_FILTER,
);

export const recruiterApplicationDocumentTypes = ['cv', 'cover_letter'] as const;
export type RecruiterApplicationDocumentType =
  (typeof recruiterApplicationDocumentTypes)[number];

export const recruiterApplicationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z
    .string()
    .trim()
    .min(APPLICATION_CONFIG.KEYWORD_MIN_LENGTH, 'Search keyword must not be empty')
    .max(
      APPLICATION_CONFIG.KEYWORD_MAX_LENGTH,
      `Search keyword cannot exceed ${APPLICATION_CONFIG.KEYWORD_MAX_LENGTH} characters`,
    )
    .optional(),
  status: recruiterStatusFilterSchema.optional(),
  jobId: objectIdSchema('job ID').optional(),
  documentType: z.enum(recruiterApplicationDocumentTypes).optional(),
  sortBy: z.enum(APPLICATION_SORT_FIELDS).default('submittedAt'),
  sortOrder: z.enum(APPLICATION_SORT_ORDERS).default('desc'),
  submittedFrom: z.coerce.date().optional(),
  submittedTo: z.coerce.date().optional(),
});

export const recruiterApplicationListQueryValidator =
  recruiterApplicationListQuerySchema.superRefine((data, ctx) => {
    if (
      data.submittedFrom &&
      data.submittedTo &&
      data.submittedFrom > data.submittedTo
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'submittedFrom must not be later than submittedTo',
        path: ['submittedTo'],
      });
    }
  });

export type RecruiterApplicationListQuery = z.infer<
  typeof recruiterApplicationListQuerySchema
>;

export const recruiterNextInterviewDtoSchema = z.object({
  id: z.string(),
  scheduledAt: z.string(),
  mode: z.string(),
});
export type RecruiterNextInterviewDTO = z.infer<
  typeof recruiterNextInterviewDtoSchema
>;

export const recruiterApplicationSummaryDtoSchema = z.object({
  id: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
  }),
  applicant: z.object({
    id: z.string(),
    fullName: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
  }),
  status: z.enum(applicationStatuses),
  reviewStage: z.enum(REVIEW_STAGES).nullable(),
  submittedDocuments: z.array(z.enum(recruiterApplicationDocumentTypes)),
  nextInterview: recruiterNextInterviewDtoSchema.nullable(),
  notesCount: z.number().int().min(0),
  submittedAt: z.string(),
  latestStatusAt: z.string(),
});
export type RecruiterApplicationSummaryDTO = z.infer<
  typeof recruiterApplicationSummaryDtoSchema
>;

export const recruiterApplicationListResponseSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  items: z.array(recruiterApplicationSummaryDtoSchema),
  statusCounts: z.object(
    Object.fromEntries(
      applicationStatuses.map((status) => [status, z.number()]),
    ) as Record<ApplicationStatus, z.ZodNumber>,
  ),
});
export type RecruiterApplicationListResponse = z.infer<
  typeof recruiterApplicationListResponseSchema
>;
