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
} from './applications.constants.js';

export interface SubmitApplicationData {
  jobId: Types.ObjectId | string;
  applicantId: Types.ObjectId | string;
  cvId: string;
  coverLetterId?: string | undefined;
  message?: string | undefined;
  // User performing the action, stored in the status history.
  changedBy: string;
  // BR-APP-010: the closed (Withdrawn/Rejected) record this application replaces.
  reappliedFrom?: Types.ObjectId | string | undefined;
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
  // The pair can hold up to two records (BR-APP-010); the latest one decides what the applicant may do next.
  async findLatestByJobAndApplicant(
    jobId: Types.ObjectId | string,
    applicantId: Types.ObjectId | string,
  ): Promise<ApplicationDoc | null> {
    return Application.findOne({ job_id: jobId, applicant_id: applicantId })
      .sort({ createdAt: -1, _id: -1 })
      .lean<ApplicationDoc>()
      .exec();
  }

  async countByJobAndApplicant(jobId: Types.ObjectId | string, applicantId: Types.ObjectId | string): Promise<number> {
    return Application.countDocuments({ job_id: jobId, applicant_id: applicantId }).exec();
  }

  async countHiredByJobId(jobId: Types.ObjectId | string): Promise<number> {
    return Application.countDocuments({ job_id: jobId, status: APPLICATION_HIRED_STATUS }).exec();
  }

  // Returns null when the partial unique (job, applicant) index rejects the insert, i.e. another active
  // application exists (a concurrent duplicate). A reapplication also marks the closed record it replaces.
  async create(data: SubmitApplicationData): Promise<ApplicationDoc | null> {
    try {
      const application = await Application.create({
        job_id: data.jobId,
        applicant_id: data.applicantId,
        cv_id: data.cvId,
        ...(data.coverLetterId ? { cover_letter_id: data.coverLetterId } : {}),
        ...(data.message ? { message: data.message } : {}),
        ...(data.reappliedFrom ? { reapplied_from: data.reappliedFrom } : {}),
        status: APPLICATION_INITIAL_STATUS,
        status_history: [this.buildHistoryEntry(data.changedBy)],
      });
      if (data.reappliedFrom) {
        // Guarded so a closed record links to one replacement only.
        await Application.updateOne(
          { _id: data.reappliedFrom, reapplied_as: { $exists: false } },
          { $set: { reapplied_as: application._id } },
        ).exec();
      }
      return application.toObject<ApplicationDoc>();
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return null;
      }
      throw error;
    }
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