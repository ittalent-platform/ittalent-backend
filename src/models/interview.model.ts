import type { HydratedDocument, Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const interviewStatuses = [
  'scheduled',
  'reschedule_requested',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type InterviewStatus = (typeof interviewStatuses)[number];
export const interviewResponses = [
  'pending',
  'accepted',
  'declined',
  'reschedule_requested',
] as const;
export type InterviewResponse = (typeof interviewResponses)[number];
export const interviewModes = ['online', 'onsite'] as const;
export type InterviewMode = (typeof interviewModes)[number];
export const interviewResponseActions = [
  'accepted',
  'declined',
  'reschedule_requested',
] as const;
export type InterviewResponseAction = (typeof interviewResponseActions)[number];

export interface InterviewHistoryEntry {
  action: InterviewResponseAction | 'scheduled';
  actor_user_id: Types.ObjectId;
  occurred_at: Date;
  reason?: string;
  proposed_date_time?: Date;
}

export interface InterviewData {
  application_id: Types.ObjectId;
  scheduled_by_user_id: Types.ObjectId;
  date_time: Date;
  duration_minutes: number;
  timezone: string;
  mode: InterviewMode;
  meeting_link?: string;
  location?: string;
  status: InterviewStatus;
  applicant_response: InterviewResponse;
  response_reason?: string;
  proposed_date_time?: Date;
  responded_at?: Date;
  response_history: InterviewHistoryEntry[];
}

const historySchema = new Schema<InterviewHistoryEntry>(
  {
    action: {
      type: String,
      enum: [...interviewResponseActions, 'scheduled'],
      required: true,
    },
    actor_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    occurred_at: { type: Date, required: true },
    reason: { type: String, trim: true },
    proposed_date_time: { type: Date },
  },
  { _id: false },
);

const interviewSchema = new Schema<InterviewData>(
  {
    application_id: {
      type: Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true,
    },
    scheduled_by_user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date_time: { type: Date, required: true, index: true },
    duration_minutes: { type: Number, required: true, min: 15, max: 180 },
    timezone: { type: String, required: true, default: 'Asia/Ho_Chi_Minh' },
    mode: { type: String, enum: interviewModes, required: true },
    meeting_link: { type: String, trim: true },
    location: { type: String, trim: true },
    status: {
      type: String,
      enum: interviewStatuses,
      required: true,
      default: 'scheduled',
      index: true,
    },
    applicant_response: {
      type: String,
      enum: interviewResponses,
      required: true,
      default: 'pending',
    },
    response_reason: { type: String, trim: true },
    proposed_date_time: { type: Date },
    responded_at: { type: Date },
    response_history: { type: [historySchema], default: [] },
  },
  { timestamps: true, collection: 'interviews' },
);

interviewSchema.index({ application_id: 1, date_time: -1 });

export const Interview = model<InterviewData>('Interview', interviewSchema);
export type InterviewDoc = HydratedDocument<InterviewData>;
