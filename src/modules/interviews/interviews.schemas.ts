import { z } from 'zod';

import { applicationStatuses } from '../../models/application.model.js';
import { interviewModes, interviewStatuses, type InterviewStatus } from '../../models/interview.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  INTERVIEW_CONFIG,
  INTERVIEW_MESSAGES,
  INTERVIEW_SORT_FIELDS,
  INTERVIEW_SORT_ORDERS,
  SETTABLE_STATUSES,
} from './interviews.constants.js';

const HTTPS_PROTOCOL = 'https:';

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
}

const meetingLinkSchema = z
  .string()
  .trim()
  .max(INTERVIEW_CONFIG.MEETING_LINK_MAX_LENGTH)
  .refine(isHttpsUrl, INTERVIEW_MESSAGES.INVALID_MEETING_LINK);
const locationSchema = z.string().trim().min(1).max(INTERVIEW_CONFIG.LOCATION_MAX_LENGTH);
const notesSchema = z.string().trim().min(1).max(INTERVIEW_CONFIG.NOTES_MAX_LENGTH);
const scheduledAtSchema = z.iso.datetime({ offset: true });
const durationSchema = z
  .number()
  .int()
  .min(INTERVIEW_CONFIG.MIN_DURATION_MINUTES)
  .max(INTERVIEW_CONFIG.MAX_DURATION_MINUTES);
const interviewerIdsSchema = z
  .array(objectIdSchema('interviewer ID'))
  .min(1)
  .max(INTERVIEW_CONFIG.MAX_INTERVIEWERS)
  .refine((ids) => new Set(ids).size === ids.length, INTERVIEW_MESSAGES.DUPLICATE_INTERVIEWERS);

export const interviewIdParamSchema = z.object({ id: objectIdSchema('interview ID') });
export type InterviewIdParam = z.infer<typeof interviewIdParamSchema>;

// strictObject: the client cannot smuggle in fields such as enterprise_id, applicant_id or status.
export const createInterviewBodySchema = z.strictObject({
  applicationId: objectIdSchema('application ID'),
  interviewerIds: interviewerIdsSchema,
  scheduledAt: scheduledAtSchema,
  durationMinutes: durationSchema.default(INTERVIEW_CONFIG.DEFAULT_DURATION_MINUTES),
  mode: z.enum(interviewModes),
  meetingLink: meetingLinkSchema.optional(),
  location: locationSchema.optional(),
  notes: notesSchema.optional(),
});
// Cross-field rules live outside the base object so OpenAPI keeps a plain object shape.
export const createInterviewBodyValidator = createInterviewBodySchema.superRefine((data, ctx) => {
  if (data.mode === 'online' && !data.meetingLink) {
    ctx.addIssue({ code: 'custom', message: INTERVIEW_MESSAGES.ONLINE_LINK_REQUIRED, path: ['meetingLink'] });
  }
  if (data.mode === 'onsite' && !data.location) {
    ctx.addIssue({ code: 'custom', message: INTERVIEW_MESSAGES.ONSITE_LOCATION_REQUIRED, path: ['location'] });
  }
});
export type CreateInterviewBody = z.infer<typeof createInterviewBodySchema>;

// `null` clears an optional field. The applicant and the application cannot change: schedule a new interview instead.
export const updateInterviewBodySchema = z.strictObject({
  interviewerIds: interviewerIdsSchema.optional(),
  scheduledAt: scheduledAtSchema.optional(),
  durationMinutes: durationSchema.optional(),
  mode: z.enum(interviewModes).optional(),
  meetingLink: meetingLinkSchema.nullable().optional(),
  location: locationSchema.nullable().optional(),
  notes: notesSchema.nullable().optional(),
});
export const updateInterviewBodyValidator = updateInterviewBodySchema.refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  INTERVIEW_MESSAGES.EMPTY_UPDATE,
);
export type UpdateInterviewBody = z.infer<typeof updateInterviewBodySchema>;

export const updateInterviewStatusBodySchema = z.strictObject({
  status: z.enum(SETTABLE_STATUSES),
  note: z.string().trim().min(1).max(INTERVIEW_CONFIG.NOTE_MAX_LENGTH).optional(),
});
export type UpdateInterviewStatusBody = z.infer<typeof updateInterviewStatusBodySchema>;

// Applicant response supported by the legacy system: propose another interview time with a reason.
export const requestInterviewRescheduleBodySchema = z.strictObject({
  proposedDateTime: scheduledAtSchema,
  reason: z.string().trim().min(1).max(INTERVIEW_CONFIG.RESCHEDULE_REASON_MAX_LENGTH),
});
export type RequestInterviewRescheduleBody = z.infer<typeof requestInterviewRescheduleBodySchema>;

// `status` accepts one value or a comma-separated list ("scheduled,completed") for multi-select filters.
export function parseInterviewStatusFilter(value: string): InterviewStatus[] {
  return value.split(INTERVIEW_CONFIG.STATUS_FILTER_SEPARATOR).map((item) => item.trim()) as InterviewStatus[];
}

const statusFilterSchema = z.string().refine(
  (value) => parseInterviewStatusFilter(value).every((item) => (interviewStatuses as readonly string[]).includes(item)),
  INTERVIEW_MESSAGES.INVALID_STATUS_FILTER,
);

const searchKeywordSchema = z
  .string()
  .trim()
  .min(INTERVIEW_CONFIG.KEYWORD_MIN_LENGTH, 'Search keyword must not be empty')
  .max(INTERVIEW_CONFIG.KEYWORD_MAX_LENGTH, `Search keyword cannot exceed ${INTERVIEW_CONFIG.KEYWORD_MAX_LENGTH} characters`);

// Filters shared by the List and the Calendar views.
const interviewFilterShape = {
  status: statusFilterSchema.optional(),
  mode: z.enum(interviewModes).optional(),
  jobId: objectIdSchema('job ID').optional(),
  applicationId: objectIdSchema('application ID').optional(),
  interviewerId: objectIdSchema('interviewer ID').optional(),
  // Matches the applicant or interviewer name/email and the job title.
  search: searchKeywordSchema.optional(),
};

export const interviewListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  ...interviewFilterShape,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.enum(INTERVIEW_SORT_FIELDS).default('scheduledAt'),
  sortOrder: z.enum(INTERVIEW_SORT_ORDERS).default('asc'),
});
export const interviewListQueryValidator = interviewListQuerySchema.superRefine((data, ctx) => {
  if (data.from && data.to && data.from > data.to) {
    ctx.addIssue({ code: 'custom', message: INTERVIEW_MESSAGES.RANGE_ORDER, path: ['to'] });
  }
});
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>;

export const interviewCalendarQuerySchema = z.strictObject({
  ...interviewFilterShape,
  from: z.coerce.date(),
  to: z.coerce.date(),
});
export const interviewCalendarQueryValidator = interviewCalendarQuerySchema.superRefine((data, ctx) => {
  if (data.from > data.to) {
    ctx.addIssue({ code: 'custom', message: INTERVIEW_MESSAGES.RANGE_ORDER, path: ['to'] });
    return;
  }
  if (data.to.getTime() - data.from.getTime() > INTERVIEW_CONFIG.CALENDAR_MAX_RANGE_DAYS * INTERVIEW_CONFIG.MS_PER_DAY) {
    ctx.addIssue({ code: 'custom', message: INTERVIEW_MESSAGES.CALENDAR_RANGE_TOO_LARGE, path: ['to'] });
  }
});
export type InterviewCalendarQuery = z.infer<typeof interviewCalendarQuerySchema>;

// The two pickers of the Schedule dialog (application, interviewer) share the same query.
export const interviewLookupQuerySchema = z.strictObject({
  search: searchKeywordSchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(INTERVIEW_CONFIG.LOOKUP_MAX_LIMIT)
    .default(INTERVIEW_CONFIG.LOOKUP_DEFAULT_LIMIT),
});
export type InterviewLookupQuery = z.infer<typeof interviewLookupQuerySchema>;

// ---- responses ----

const participantDtoSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  // Null when the account no longer exists.
  email: z.string().nullable(),
});
export type InterviewParticipantDTO = z.infer<typeof participantDtoSchema>;

const rescheduleRequestDtoSchema = z.object({
  proposedDateTime: z.string(),
  reason: z.string(),
  requestedAt: z.string(),
});
export type InterviewRescheduleRequestDTO = z.infer<typeof rescheduleRequestDtoSchema>;

export const interviewDtoSchema = z.object({
  id: z.string(),
  status: z.enum(interviewStatuses),
  scheduledAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number().int(),
  mode: z.enum(interviewModes),
  meetingLink: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  rescheduleRequest: rescheduleRequestDtoSchema.nullable(),
  applicationId: z.string(),
  job: z.object({ id: z.string(), title: z.string().nullable() }),
  applicant: participantDtoSchema,
  interviewers: z.array(participantDtoSchema),
  // True while the interview is scheduled and has ended, i.e. it may be marked completed or no-show.
  canComplete: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InterviewDTO = z.infer<typeof interviewDtoSchema>;

const statusHistoryEntryDtoSchema = z.object({
  status: z.enum(interviewStatuses),
  changedAt: z.string(),
  changedBy: z.string(),
  note: z.string().nullable(),
});
export const interviewDetailDtoSchema = interviewDtoSchema.extend({
  createdBy: z.string(),
  statusHistory: z.array(statusHistoryEntryDtoSchema),
});
export type InterviewDetailDTO = z.infer<typeof interviewDetailDtoSchema>;

export const interviewListResponseSchema = z.object({
  items: z.array(interviewDtoSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type InterviewListResponse = z.infer<typeof interviewListResponseSchema>;

export const interviewCalendarResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  total: z.number().int(),
  // True when more interviews matched than the calendar returns; narrow the window or the filters.
  truncated: z.boolean(),
  items: z.array(interviewDtoSchema),
});
export type InterviewCalendarResponse = z.infer<typeof interviewCalendarResponseSchema>;

// An application an interview can still be scheduled for, with what the dialog shows about it.
export const schedulableApplicationDtoSchema = z.object({
  id: z.string(),
  status: z.enum(applicationStatuses),
  appliedAt: z.string(),
  job: z.object({ id: z.string(), title: z.string().nullable() }),
  applicant: participantDtoSchema,
});
export type SchedulableApplicationDTO = z.infer<typeof schedulableApplicationDtoSchema>;

export const schedulableApplicationListResponseSchema = z.object({ items: z.array(schedulableApplicationDtoSchema) });
export type SchedulableApplicationListResponse = z.infer<typeof schedulableApplicationListResponseSchema>;

// A recruiter of the same enterprise who can be added as an interviewer.
export const interviewerOptionDtoSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  email: z.string(),
});
export type InterviewerOptionDTO = z.infer<typeof interviewerOptionDtoSchema>;

export const interviewerListResponseSchema = z.object({ items: z.array(interviewerOptionDtoSchema) });
export type InterviewerListResponse = z.infer<typeof interviewerListResponseSchema>;
