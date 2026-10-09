import { z } from 'zod';
import {
  interviewModes,
  interviewResponseActions,
  interviewResponses,
  interviewStatuses,
} from '../../models/interview.model.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  INTERVIEW_LIMITS,
  INTERVIEW_MESSAGES,
} from './interviews.constants.js';

export const interviewIdParamSchema = z.object({
  id: objectIdSchema('interview ID'),
});
export const interviewResponseBodySchema = z
  .object({
    response: z.enum(interviewResponseActions),
    reason: z
      .string()
      .trim()
      .min(1)
      .max(INTERVIEW_LIMITS.REASON_MAX_LENGTH)
      .optional(),
    proposedDateTime: z.iso.datetime().optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.response === 'reschedule_requested' &&
      (!input.reason || !input.proposedDateTime)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['response'],
        message: INTERVIEW_MESSAGES.RESCHEDULE_FIELDS_REQUIRED,
      });
    }
    if (
      input.proposedDateTime &&
      Date.parse(input.proposedDateTime) <= Date.now()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['proposedDateTime'],
        message: 'Proposed interview time must be in the future.',
      });
    }
  });

const interviewHistoryEntrySchema = z.object({
  action: z.enum([...interviewResponseActions, 'scheduled']),
  actorUserId: z.string(),
  occurredAt: z.string(),
  reason: z.string().optional(),
  proposedDateTime: z.string().optional(),
});
export const interviewResponseSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  dateTime: z.string(),
  durationMinutes: z.number().int(),
  timezone: z.string(),
  mode: z.enum(interviewModes),
  meetingLink: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(interviewStatuses),
  applicantResponse: z.enum(interviewResponses),
  responseReason: z.string().optional(),
  proposedDateTime: z.string().optional(),
  respondedAt: z.string().optional(),
  responseHistory: z.array(interviewHistoryEntrySchema),
});

export type InterviewIdParam = z.infer<typeof interviewIdParamSchema>;
export type InterviewResponseBody = z.infer<typeof interviewResponseBodySchema>;
export type InterviewResponseDto = z.infer<typeof interviewResponseSchema>;
