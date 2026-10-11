import { z } from 'zod';

import { interviewModes, interviewStatuses } from '../../models/interview.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  INTERVIEW_CONFIG,
  INTERVIEW_MESSAGES,
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

// ---- responses ----

const participantDtoSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  // Null when the account no longer exists.
  email: z.string().nullable(),
});
export type InterviewParticipantDTO = z.infer<typeof participantDtoSchema>;

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
  applicationId: z.string(),
  job: z.object({ id: z.string(), title: z.string().nullable() }),
  applicant: participantDtoSchema,
  interviewers: z.array(participantDtoSchema),
  // True while the interview is scheduled and its time has arrived, i.e. it may be marked completed.
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

