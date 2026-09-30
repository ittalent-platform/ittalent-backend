import type { Types } from 'mongoose';

import {
  Application,
  type ApplicationDoc,
  type ApplicationStatusHistoryEntry,
} from '../../models/application.model.js';
import {
  APPLICATION_CONFIG,
  APPLICATION_HIRED_STATUS,
  APPLICATION_INITIAL_STATUS,
  REAPPLY_ALLOWED_STATUSES,
} from './applications.constants.js';

export interface SubmitApplicationData {
  jobId: Types.ObjectId | string;
  applicantId: Types.ObjectId | string;
  cvId: string;
  coverLetterId?: string | undefined;
  message?: string | undefined;
  // User performing the action, stored in the status history.
  changedBy: string;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === APPLICATION_CONFIG.MONGO_DUPLICATE_KEY_ERROR_CODE
  );
}

export class ApplicationsRepository {
  async findByJobAndApplicant(
    jobId: Types.ObjectId | string,
    applicantId: Types.ObjectId | string,
  ): Promise<ApplicationDoc | null> {
    return Application.findOne({ job_id: jobId, applicant_id: applicantId }).lean<ApplicationDoc>().exec();
  }

  async countHiredByJobId(jobId: Types.ObjectId | string): Promise<number> {
    return Application.countDocuments({ job_id: jobId, status: APPLICATION_HIRED_STATUS }).exec();
  }

  // Returns null when the unique (job, applicant) index rejects the insert, i.e. a concurrent duplicate.
  async create(data: SubmitApplicationData): Promise<ApplicationDoc | null> {
    try {
      const application = await Application.create({
        job_id: data.jobId,
        applicant_id: data.applicantId,
        cv_id: data.cvId,
        ...(data.coverLetterId ? { cover_letter_id: data.coverLetterId } : {}),
        ...(data.message ? { message: data.message } : {}),
        status: APPLICATION_INITIAL_STATUS,
        status_history: [this.buildHistoryEntry(data.changedBy)],
      });
      return application.toObject<ApplicationDoc>();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
  }

  // Reuses an existing Withdrawn/Rejected record. The status condition makes this atomic:
  // returns null if the record is no longer reactivatable (e.g. changed by a concurrent request).
  async reactivate(id: Types.ObjectId | string, data: SubmitApplicationData): Promise<ApplicationDoc | null> {
    // The new submission fully replaces the old CV / cover letter / message.
    const unset: Record<string, ''> = {};
    const set: Record<string, unknown> = {
      cv_id: data.cvId,
      status: APPLICATION_INITIAL_STATUS,
    };

    if (data.coverLetterId) {
      set.cover_letter_id = data.coverLetterId;
    } else {
      unset.cover_letter_id = '';
    }

    if (data.message) {
      set.message = data.message;
    } else {
      unset.message = '';
    }

    return Application.findOneAndUpdate(
      { _id: id, status: { $in: REAPPLY_ALLOWED_STATUSES } },
      {
        $set: set,
        $unset: unset,
        $push: { status_history: this.buildHistoryEntry(data.changedBy) },
      },
      { returnDocument: 'after' },
    )
      .lean<ApplicationDoc>()
      .exec();
  }

  private buildHistoryEntry(changedBy: string): Pick<ApplicationStatusHistoryEntry, 'status' | 'changed_at'> & {
    changed_by: string;
  } {
    return {
      status: APPLICATION_INITIAL_STATUS,
      changed_at: new Date(),
      changed_by: changedBy,
    };
  }
}

export const applicationsRepository = new ApplicationsRepository();