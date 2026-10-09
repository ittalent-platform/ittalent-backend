import { Types } from 'mongoose';
import { Application } from '../../models/application.model.js';
import { Interview, type InterviewDoc } from '../../models/interview.model.js';
import type { InterviewResponseBody } from './interviews.schemas.js';

export class InterviewsRepository {
  private async ownedApplicationIds(userId: string): Promise<Types.ObjectId[]> {
    const ids = await Application.find({ applicant_id: userId })
      .distinct('_id')
      .exec();
    return ids.map((id) => new Types.ObjectId(String(id)));
  }

  async findOwnedById(
    id: string,
    userId: string,
  ): Promise<InterviewDoc | null> {
    const applicationIds = await this.ownedApplicationIds(userId);
    return Interview.findOne({
      _id: id,
      application_id: { $in: applicationIds },
    }).exec();
  }

  async respond(
    id: string,
    userId: string,
    input: InterviewResponseBody,
    at: Date,
  ): Promise<InterviewDoc | null> {
    const applicationIds = await this.ownedApplicationIds(userId);
    const isReschedule = input.response === 'reschedule_requested';
    const proposedDateTime = input.proposedDateTime
      ? new Date(input.proposedDateTime)
      : undefined;
    return Interview.findOneAndUpdate(
      {
        _id: id,
        application_id: { $in: applicationIds },
        status: 'scheduled',
        applicant_response: 'pending',
      },
      {
        $set: {
          applicant_response: input.response,
          responded_at: at,
          ...(isReschedule && proposedDateTime
            ? {
                status: 'reschedule_requested',
                proposed_date_time: proposedDateTime,
              }
            : {}),
          ...(input.reason ? { response_reason: input.reason } : {}),
        },
        $push: {
          response_history: {
            action: input.response,
            actor_user_id: new Types.ObjectId(userId),
            occurred_at: at,
            ...(input.reason ? { reason: input.reason } : {}),
            ...(isReschedule && proposedDateTime
              ? {
                  proposed_date_time: proposedDateTime,
                }
              : {}),
          },
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }
}

export const interviewsRepository = new InterviewsRepository();
