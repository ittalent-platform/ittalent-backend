import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const applicationStatuses = [
  'submitted',
  'under_review',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

// BR-APP-002 / BR-APP-010: a Withdrawn or Rejected record is closed and frees the applicant/job pair;
// every other status keeps the pair occupied, so at most one active application exists per pair.
export const applicationOccupyingStatuses = applicationStatuses.filter(
  (status) => status !== 'withdrawn' && status !== 'rejected',
);

export interface ApplicationStatusHistoryEntry {
  status: ApplicationStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
}

export interface ApplicationData {
  job_id: Types.ObjectId;
  // User id of the applicant. Documents (cv_id / cover_letter_id) are also owned by the User (Document.owner_id).
  applicant_id: Types.ObjectId;
  cv_id: Types.ObjectId;
  cover_letter_id?: Types.ObjectId;
  message?: string;
  status: ApplicationStatus;
  // BR-APP-010: read-only links between a closed record and the single application that replaced it.
  reapplied_from?: Types.ObjectId;
  reapplied_as?: Types.ObjectId;
  // Append-only: one entry per accepted status change.
  status_history: ApplicationStatusHistoryEntry[];
}

const statusHistorySchema = new Schema<ApplicationStatusHistoryEntry>(
  {
    status: { type: String, enum: applicationStatuses, required: true },
    changed_at: { type: Date, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationData>(
  {
    job_id: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
    applicant_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cv_id: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    cover_letter_id: { type: Schema.Types.ObjectId, ref: 'Document' },
    message: { type: String, trim: true },
    status: { type: String, enum: applicationStatuses, default: 'submitted', required: true },
    reapplied_from: { type: Schema.Types.ObjectId, ref: 'Application' },
    reapplied_as: { type: Schema.Types.ObjectId, ref: 'Application' },
    status_history: { type: [statusHistorySchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'applications',
  },
);

// One ACTIVE record per applicant/job pair (BR-APP-002). Withdrawn and Rejected records do not occupy the
// pair, so applying again creates a new record (BR-APP-010) and the closed one is never reopened. The
// index also stops concurrent duplicate submissions.
applicationSchema.index(
  { job_id: 1, applicant_id: 1 },
  { unique: true, partialFilterExpression: { status: { $in: applicationOccupyingStatuses } } },
);
applicationSchema.index({ job_id: 1, applicant_id: 1, createdAt: -1 });
applicationSchema.index({ job_id: 1, status: 1 });
applicationSchema.index({ applicant_id: 1, createdAt: -1 });

export const Application = model('Application', applicationSchema);
export type ApplicationDoc = ApplicationData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};