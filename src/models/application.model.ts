import type { HydratedDocument, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const applicationStatuses = [
  'submitted',
  'under_review',
  'interviewing',
  'offered',
  'hired',
  'rejected',
  'withdrawn',
  // Set by the system when the company fills the job; never chosen by the candidate.
  'position_filled',
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];
export const APPLICATION_REASON_MAX_LENGTH = 500;

// BR-APP-008: a Withdrawn record frees the candidate/job pair; every other status keeps it occupied.
export const applicationOccupyingStatuses = applicationStatuses.filter((status) => status !== 'withdrawn');

export const applicationReviewStages = [
  'screening',
  'interview',
  'offer',
  'hired',
  'rejected',
] as const;
export type ApplicationReviewStage = (typeof applicationReviewStages)[number];

export const applicationAttachmentTypes = ['cv', 'cover_letter'] as const;
export type ApplicationAttachmentType = (typeof applicationAttachmentTypes)[number];

// Public-facing actor role only; account identifiers and display names are never stored here.
export const applicationActorRoles = ['candidate', 'company', 'system'] as const;
export type ApplicationActorRole = (typeof applicationActorRoles)[number];

export interface JobSnapshotData {
  title: string;
  company_name: string;
  location?: string | undefined;
  job_type?: string | undefined;
  deadline?: Date | undefined;
  public_status: string;
}

// Metadata-only snapshot of the submitted document. Deliberately excludes file URLs
// and storage keys so candidate-facing responses never leak direct document access.
export interface AttachmentSnapshotData {
  document_id: Types.ObjectId;
  type: ApplicationAttachmentType;
  file_name: string;
  mime_type: string;
  size: number;
  submitted_at: Date;
}

// Append-only embedded history. Entries are only ever added via `$push`, never replaced.
export interface ApplicationHistoryEntryData {
  status: ApplicationStatus;
  review_stage?: ApplicationReviewStage | undefined;
  actor_role: ApplicationActorRole;
  occurred_at: Date;
}

export interface ApplicationData {
  applicant_id: Types.ObjectId;
  job_id: Types.ObjectId;
  status: ApplicationStatus;
  review_stage?: ApplicationReviewStage | undefined;
  job_snapshot: JobSnapshotData;
  attachments: AttachmentSnapshotData[];
  message?: string | undefined;
  withdrawal_reason?: string | undefined;
  withdrawn_at?: Date | undefined;
  // BR-APP-008: read-only links between a Withdrawn record and the single reapplication that replaced it.
  reapplied_from?: Types.ObjectId | undefined;
  reapplied_as?: Types.ObjectId | undefined;
  version: number;
  submitted_at: Date;
  latest_status_at: Date;
  history: ApplicationHistoryEntryData[];
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

const jobSnapshotSchema = new Schema<JobSnapshotData>(
  {
    title: { type: String, required: true, trim: true },
    company_name: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    job_type: { type: String, trim: true },
    deadline: { type: Date },
    public_status: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const attachmentSnapshotSchema = new Schema<AttachmentSnapshotData>(
  {
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    type: { type: String, enum: applicationAttachmentTypes, required: true },
    file_name: { type: String, required: true, trim: true },
    mime_type: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    submitted_at: { type: Date, required: true },
  },
  { _id: false },
);

const historyEntrySchema = new Schema<ApplicationHistoryEntryData>(
  {
    status: { type: String, enum: applicationStatuses, required: true },
    review_stage: { type: String, enum: applicationReviewStages },
    actor_role: { type: String, enum: applicationActorRoles, required: true },
    occurred_at: { type: Date, required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationData>(
  {
    applicant_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    job_id: { type: Schema.Types.ObjectId, required: true, index: true },
    status: {
      type: String,
      enum: applicationStatuses,
      required: true,
      default: 'submitted',
      index: true,
    },
    review_stage: { type: String, enum: applicationReviewStages },
    job_snapshot: { type: jobSnapshotSchema, required: true },
    attachments: { type: [attachmentSnapshotSchema], default: [] },
    message: { type: String, trim: true },
    withdrawal_reason: { type: String, trim: true, maxlength: APPLICATION_REASON_MAX_LENGTH },
    withdrawn_at: { type: Date },
    reapplied_from: { type: Schema.Types.ObjectId, ref: 'Application' },
    reapplied_as: { type: Schema.Types.ObjectId, ref: 'Application' },
    version: { type: Number, required: true, default: 0 },
    submitted_at: { type: Date, required: true, default: Date.now },
    latest_status_at: { type: Date, required: true, default: Date.now },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true, collection: 'applications' },
);

// BR-APP-002 / BR-APP-008: at most one non-withdrawn application per candidate/job pair. A Withdrawn
// record does not occupy the pair, so exactly one reapplication can follow it.
applicationSchema.index(
  { applicant_id: 1, job_id: 1 },
  { unique: true, partialFilterExpression: { status: { $in: applicationOccupyingStatuses } } },
);
// Deterministic newest-first list ordering plus indexed candidate scope (BR-APP-001, BR-APP-006).
applicationSchema.index({ applicant_id: 1, submitted_at: -1, _id: -1 });
applicationSchema.index({ applicant_id: 1, status: 1 });

export const Application = model<ApplicationData>('Application', applicationSchema);
export type ApplicationDoc = HydratedDocument<ApplicationData>;
