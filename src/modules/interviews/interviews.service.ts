import type { InterviewDoc } from '../../models/interview.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { INTERVIEW_MESSAGES } from './interviews.constants.js';
import {
  interviewsRepository,
  type InterviewsRepository,
} from './interviews.repository.js';
import type {
  InterviewResponseBody,
  InterviewResponseDto,
} from './interviews.schemas.js';

export class InterviewsService {
  constructor(
    private readonly repository: InterviewsRepository = interviewsRepository,
  ) {}

  private map(interview: InterviewDoc): InterviewResponseDto {
    return {
      id: String(interview._id),
      applicationId: String(interview.application_id),
      dateTime: interview.date_time.toISOString(),
      durationMinutes: interview.duration_minutes,
      timezone: interview.timezone,
      mode: interview.mode,
      ...(interview.meeting_link
        ? { meetingLink: interview.meeting_link }
        : {}),
      ...(interview.location ? { location: interview.location } : {}),
      status: interview.status,
      applicantResponse: interview.applicant_response,
      ...(interview.response_reason
        ? { responseReason: interview.response_reason }
        : {}),
      ...(interview.proposed_date_time
        ? { proposedDateTime: interview.proposed_date_time.toISOString() }
        : {}),
      ...(interview.responded_at
        ? { respondedAt: interview.responded_at.toISOString() }
        : {}),
      responseHistory: interview.response_history.map((entry) => ({
        action: entry.action,
        actorUserId: String(entry.actor_user_id),
        occurredAt: entry.occurred_at.toISOString(),
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.proposed_date_time
          ? { proposedDateTime: entry.proposed_date_time.toISOString() }
          : {}),
      })),
    };
  }

  async respond(
    id: string,
    userId: string,
    input: InterviewResponseBody,
  ): Promise<InterviewResponseDto> {
    const existing = await this.repository.findOwnedById(id, userId);
    if (!existing)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        INTERVIEW_MESSAGES.NOT_FOUND,
      );
    if (
      existing.status !== 'scheduled' ||
      existing.applicant_response !== 'pending'
    ) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        INTERVIEW_MESSAGES.RESPONSE_NOT_ALLOWED,
      );
    }
    const updated = await this.repository.respond(
      id,
      userId,
      input,
      new Date(),
    );
    if (!updated)
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        INTERVIEW_MESSAGES.RESPONSE_CONFLICT,
      );
    return this.map(updated);
  }
}

export const interviewsService = new InterviewsService();
