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
  RECRUITER_TARGET_STATUSES,
  REVIEW_STAGES,
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
  page: z.coerce.number().int().min(1).default(APPLICATION_CONFIG.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(APPLICATION_CONFIG.HISTORY_MAX_LIMIT)
    .default(APPLICATION_CONFIG.HISTORY_DEFAULT_LIMIT),
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

export const recruiterAttachmentDtoSchema = z.object({
  documentId: z.string(),
  type: z.enum(recruiterApplicationDocumentTypes),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().min(0),
  submittedAt: z.string(),
});
export type RecruiterAttachmentDTO = z.infer<
  typeof recruiterAttachmentDtoSchema
>;

export const recruiterInterviewTimelineEntrySchema = z.object({
  id: z.string(),
  scheduledAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int().min(1),
  mode: z.enum(['online', 'onsite']),
  meetingLink: z.string().nullable(),
  location: z.string().nullable(),
  status: z.enum(['scheduled', 'reschedule_requested', 'completed', 'cancelled', 'no_show']),
  notes: z.string().nullable(),
});
export type RecruiterInterviewTimelineEntryDTO = z.infer<
  typeof recruiterInterviewTimelineEntrySchema
>;

export const recruiterNoteEntryDtoSchema = z.object({
  authorId: z.string(),
  authorName: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type RecruiterNoteEntryDTO = z.infer<
  typeof recruiterNoteEntryDtoSchema
>;

export const recruiterStatusHistoryEntryDtoSchema = z.object({
  status: z.enum(applicationStatuses),
  reviewStage: z.enum(REVIEW_STAGES).nullable(),
  actorRole: z.string().nullable(),
  note: z.string().nullable(),
  messageToCandidate: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  occurredAt: z.string(),
});
export type RecruiterStatusHistoryEntryDTO = z.infer<
  typeof recruiterStatusHistoryEntryDtoSchema
>;

export const recruiterApplicationDetailDtoSchema = z.object({
  id: z.string(),
  job: z.object({
    id: z.string(),
    title: z.string(),
    location: z.string().nullable(),
    employmentType: z.string().nullable(),
    department: z.string().nullable(),
    status: z.string(),
    expiresAt: z.string().nullable(),
  }),
  applicant: z.object({
    id: z.string(),
    fullName: z.string().nullable(),
    email: z.string(),
    phone: z.string().nullable(),
    role: z.string(),
    status: z.string(),
  }),
  status: z.enum(applicationStatuses),
  reviewStage: z.enum(REVIEW_STAGES).nullable(),
  message: z.string().nullable(),
  withdrawalReason: z.string().nullable(),
  attachments: z.array(recruiterAttachmentDtoSchema),
  interviews: z.array(recruiterInterviewTimelineEntrySchema),
  notes: z.array(recruiterNoteEntryDtoSchema),
  statusHistory: z.array(recruiterStatusHistoryEntryDtoSchema),
  version: z.number().int().min(0),
  submittedAt: z.string(),
  latestStatusAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RecruiterApplicationDetailDTO = z.infer<
  typeof recruiterApplicationDetailDtoSchema
>;

export const recruiterApplicationCvMetadataDtoSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int().min(1),
  fileUrl: z.string(),
});
export type RecruiterApplicationCvMetadataDTO = z.infer<
  typeof recruiterApplicationCvMetadataDtoSchema
>;

export const createRecruiterNoteBodySchema = z.strictObject({
  content: z
    .string()
    .trim()
    .min(1, 'Note content cannot be empty')
    .max(
      APPLICATION_CONFIG.NOTE_MAX_LENGTH,
      `Note content cannot exceed ${APPLICATION_CONFIG.NOTE_MAX_LENGTH} characters`,
    ),
});
export type CreateRecruiterNoteBody = z.infer<
  typeof createRecruiterNoteBodySchema
>;

export const recruiterNotesListResponseSchema = z.object({
  items: z.array(recruiterNoteEntryDtoSchema),
  total: z.number().int().min(0),
});
export type RecruiterNotesListResponse = z.infer<
  typeof recruiterNotesListResponseSchema
>;

export const updateRecruiterApplicationStatusBodySchema = z.strictObject({
  status: z.enum(RECRUITER_TARGET_STATUSES),
  note: z
    .string()
    .trim()
    .max(
      APPLICATION_CONFIG.NOTE_MAX_LENGTH,
      `Note cannot exceed ${APPLICATION_CONFIG.NOTE_MAX_LENGTH} characters`,
    )
    .optional(),
  messageToCandidate: z
    .string()
    .trim()
    .max(
      APPLICATION_CONFIG.MESSAGE_TO_CANDIDATE_MAX_LENGTH,
      `Message to candidate cannot exceed ${APPLICATION_CONFIG.MESSAGE_TO_CANDIDATE_MAX_LENGTH} characters`,
    )
    .optional(),
  rejectionReason: z
    .string()
    .trim()
    .min(
      APPLICATION_CONFIG.REASON_MIN_LENGTH,
      `Rejection reason must be at least ${APPLICATION_CONFIG.REASON_MIN_LENGTH} characters`,
    )
    .max(
      APPLICATION_CONFIG.REASON_MAX_LENGTH,
      `Rejection reason cannot exceed ${APPLICATION_CONFIG.REASON_MAX_LENGTH} characters`,
    )
    .optional(),
  expectedVersion: z.number().int().min(0).optional(),
});
export type UpdateRecruiterApplicationStatusBody = z.infer<
  typeof updateRecruiterApplicationStatusBodySchema
>;

