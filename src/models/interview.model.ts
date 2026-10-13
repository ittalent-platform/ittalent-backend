import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const interviewStatuses = ['scheduled', 'reschedule_requested', 'completed', 'cancelled', 'no_show'] as const;
export type InterviewStatus = (typeof interviewStatuses)[number];

export const interviewModes = ['online', 'onsite'] as const;
export type InterviewMode = (typeof interviewModes)[number];

export interface InterviewStatusHistoryEntry {
  status: InterviewStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
  note?: string;
}

export interface InterviewRescheduleRequest {
  proposed_time: Date;
  reason: string;
  requested_at: Date;
}

export interface InterviewData {
  // The company that owns the interview; every read and write is scoped to it.
  enterprise_id: Types.ObjectId;
  application_id: Types.ObjectId;
  // Copied from the application so the list can filter by job without a join.
  job_id: Types.ObjectId;
  // User id of the applicant (Application.applicant_id).
  applicant_id: Types.ObjectId;
  interviewer_ids: Types.ObjectId[];
  created_by: Types.ObjectId;
  scheduled_at: Date;
  // scheduled_at + duration. Stored so overlap checks and the calendar view are plain indexed range queries.
  ends_at: Date;
  duration_minutes: number;
  mode: InterviewMode;
  meeting_link?: string;
  location?: string;
  notes?: string;
  status: InterviewStatus;
  // Present only while the applicant's request for another time is pending recruiter review.
  reschedule_request?: InterviewRescheduleRequest;
  // Append-only: one entry per accepted status change, starting with the creation.
  status_history: InterviewStatusHistoryEntry[];
}

const statusHistorySchema = new Schema<InterviewStatusHistoryEntry>(
  {
    status: { type: String, enum: interviewStatuses, required: true },
    changed_at: { type: Date, required: true },
    changed_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const rescheduleRequestSchema = new Schema<InterviewRescheduleRequest>(
  {
    proposed_time: { type: Date, required: true },
    reason: { type: String, required: true, trim: true },
    requested_at: { type: Date, required: true },
  },
  { _id: false },
);

const interviewSchema = new Schema<InterviewData>(
  {
    enterprise_id: { type: Schema.Types.ObjectId, ref: 'Enterprise', required: true },
    application_id: { type: Schema.Types.ObjectId, ref: 'Application', required: true },
    job_id: { type: Schema.Types.ObjectId, ref: 'JobPosting', required: true },
    applicant_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    interviewer_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], required: true },
    created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scheduled_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    duration_minutes: { type: Number, required: true, min: 1 },
    mode: { type: String, enum: interviewModes, required: true },
    meeting_link: { type: String, trim: true },
    location: { type: String, trim: true },
    notes: { type: String, trim: true },
    status: { type: String, enum: interviewStatuses, default: 'scheduled', required: true },
    reschedule_request: { type: rescheduleRequestSchema, required: false },
    status_history: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true, collection: 'interviews' },
);

interviewSchema.index({ enterprise_id: 1, scheduled_at: 1 });
interviewSchema.index({ enterprise_id: 1, status: 1, scheduled_at: 1 });
// Conflict checks and the interviewer's own calendar.
interviewSchema.index({ interviewer_ids: 1, status: 1, scheduled_at: 1 });
interviewSchema.index({ applicant_id: 1, status: 1, scheduled_at: 1 });
interviewSchema.index({ application_id: 1, createdAt: -1 });

export const Interview = model<InterviewData>('Interview', interviewSchema);
export type InterviewDoc = InterviewData & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};
