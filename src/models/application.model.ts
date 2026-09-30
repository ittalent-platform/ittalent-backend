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
    status_history: { type: [statusHistorySchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'applications',
  },
);

// One record per applicant/job pair: re-applying after Withdrawn/Rejected reuses the record,
// and this index also stops concurrent duplicate submissions.
applicationSchema.index({ job_id: 1, applicant_id: 1 }, { unique: true });
applicationSchema.index({ job_id: 1, status: 1 });
applicationSchema.index({ applicant_id: 1, createdAt: -1 });

export const Application = model('Application', applicationSchema);
export type ApplicationDoc = ApplicationData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};