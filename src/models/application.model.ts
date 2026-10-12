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
  'position_filled',
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export const APPLICATION_REASON_MAX_LENGTH = 500;

// BR-APP-002 / BR-APP-010 / BR-18: a Withdrawn, Rejected, or Position Filled record is closed and frees
// the applicant/job pair; every other status keeps the pair occupied, so at most one active application
// exists per pair.
export const applicationOccupyingStatuses = applicationStatuses.filter(
  (status) => status !== 'withdrawn' && status !== 'rejected' && status !== 'position_filled',
);

export interface ApplicationStatusHistoryEntry {
  status: ApplicationStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
  actor_role?: string;
  note?: string;
  message_to_candidate?: string;
  rejection_reason?: string;
}

export const APPLICATION_NOTE_MAX_LENGTH = 2000;

export interface ApplicationNoteEntry {
  author_id: Types.ObjectId;
  author_name: string;
  content: string;
  created_at: Date;
}

// A copy of a certificate link as it was when the application was sent; later edits or deletion don't touch it.
export interface ApplicationCertificateSnapshot {
  certificate_id: Types.ObjectId;
  version: number;
  name: string;
  url: string;
  issuer?: string;
  issued_date?: string;
  expiry_date?: string;
}

export interface ApplicationData {
  job_id: Types.ObjectId;
  // User id of the applicant. Documents (cv_id / cover_letter_id) are also owned by the User (Document.owner_id).
  applicant_id: Types.ObjectId;
  cv_id: Types.ObjectId;
  cover_letter_id?: Types.ObjectId;
  message?: string;
  status: ApplicationStatus;
  // Optional reason the applicant gave when withdrawing; visible to the company.
  withdrawal_reason?: string;
  // BR-APP-010: read-only links between a closed record and the single application that replaced it.
  reapplied_from?: Types.ObjectId;
  reapplied_as?: Types.ObjectId;
  // Append-only: one entry per accepted status change.
  status_history: ApplicationStatusHistoryEntry[];
  certificates: ApplicationCertificateSnapshot[];
  // Append-only internal notes recorded by recruiters for team evaluation.
  notes: ApplicationNoteEntry[];
}

const statusHistorySchema = new Schema<ApplicationStatusHistoryEntry>(
  {
    status: { type: String, enum: applicationStatuses, required: true },
    changed_at: { type: Date, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor_role: { type: String, trim: true },
    note: { type: String, trim: true, maxlength: APPLICATION_REASON_MAX_LENGTH },
    message_to_candidate: { type: String, trim: true, maxlength: 1000 },
    rejection_reason: { type: String, trim: true, maxlength: APPLICATION_REASON_MAX_LENGTH },
  },
  { _id: false },
);

const noteSchema = new Schema<ApplicationNoteEntry>(
  {
    author_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    author_name: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true, maxlength: APPLICATION_NOTE_MAX_LENGTH },
    created_at: { type: Date, default: Date.now, required: true },
  },
  { _id: false },
);

const certificateSnapshotSchema = new Schema<ApplicationCertificateSnapshot>(
  {
    certificate_id: { type: Schema.Types.ObjectId, ref: 'CertificateLink', required: true },
    version: { type: Number, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    issuer: { type: String },
    issued_date: { type: String },
    expiry_date: { type: String },
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
    withdrawal_reason: { type: String, trim: true, maxlength: APPLICATION_REASON_MAX_LENGTH },
    reapplied_from: { type: Schema.Types.ObjectId, ref: 'Application' },
    reapplied_as: { type: Schema.Types.ObjectId, ref: 'Application' },
    status_history: { type: [statusHistorySchema], default: [] },
    certificates: { type: [certificateSnapshotSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
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
applicationSchema.index({ applicant_id: 1, 'certificates.certificate_id': 1 });

export const Application = model('Application', applicationSchema);
export type ApplicationDoc = ApplicationData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
