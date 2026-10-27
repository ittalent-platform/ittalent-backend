import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const reportTargetTypes = ['job', 'enterprise', 'user'] as const;
export type ReportTargetType = (typeof reportTargetTypes)[number];

export const reportReasonCategories = [
  'scam_fraud',
  'fee_extortion',
  'misleading_info',
  'offensive_content',
  'impersonation',
  'harassment',
  'other',
] as const;
export type ReportReasonCategory = (typeof reportReasonCategories)[number];

export const reportStatuses = [
  'pending',
  'reviewing',
  'resolved',
  'rejected',
  'withdrawn',
] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export const reportResolutionDecisions = ['resolved', 'rejected'] as const;
export type ReportResolutionDecision = (typeof reportResolutionDecisions)[number];

export const reportActionsTaken = [
  'warning_issued',
  'content_takedown',
  'account_suspended',
  'none',
] as const;
export type ReportActionTaken = (typeof reportActionsTaken)[number];

export interface ReportTimelineEvent {
  status: ReportStatus;
  timestamp: Date;
  actor_id?: Types.ObjectId | null;
  note?: string | null;
}

export interface ReportData {
  ticket_id: string;
  reporter_id: Types.ObjectId;
  target_type: ReportTargetType;
  target_id: Types.ObjectId;
  target_title: string;
  target_link?: string | null;
  reason_category: ReportReasonCategory;
  title: string;
  description: string;
  evidence_files: string[];
  is_anonymous: boolean;
  status: ReportStatus;
  withdrawal_reason?: string | null;
  withdrawn_at?: Date | null;
  is_deleted_by_reporter: boolean;
  deleted_by_reporter_at?: Date | null;
  assigned_admin_id?: Types.ObjectId | null;
  reviewed_at?: Date | null;
  resolution_decision?: ReportResolutionDecision | null;
  action_taken?: ReportActionTaken | null;
  internal_notes?: string | null;
  message_to_reporter?: string | null;
  resolved_at?: Date | null;
  timeline: ReportTimelineEvent[];
  createdAt?: Date;
  updatedAt?: Date;
}

const reportTimelineSchema = new Schema<ReportTimelineEvent>(
  {
    status: { type: String, enum: reportStatuses, required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    actor_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const reportSchema = new Schema<ReportData>(
  {
    ticket_id: { type: String, required: true, unique: true, index: true },
    reporter_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    target_type: { type: String, enum: reportTargetTypes, required: true, index: true },
    target_id: { type: Schema.Types.ObjectId, required: true, index: true },
    target_title: { type: String, required: true, trim: true },
    target_link: { type: String, default: null, trim: true },
    reason_category: { type: String, enum: reportReasonCategories, required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 1500 },
    evidence_files: { type: [String], default: [] },
    is_anonymous: { type: Boolean, default: true },
    status: { type: String, enum: reportStatuses, default: 'pending', index: true },
    withdrawal_reason: { type: String, default: null },
    withdrawn_at: { type: Date, default: null },
    is_deleted_by_reporter: { type: Boolean, default: false, index: true },
    deleted_by_reporter_at: { type: Date, default: null },
    assigned_admin_id: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    reviewed_at: { type: Date, default: null },
    resolution_decision: { type: String, enum: reportResolutionDecisions, default: null },
    action_taken: { type: String, enum: reportActionsTaken, default: null },
    internal_notes: { type: String, default: null, maxlength: 1000 },
    message_to_reporter: { type: String, default: null, maxlength: 500 },
    resolved_at: { type: Date, default: null },
    timeline: { type: [reportTimelineSchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'reports',
  },
);

reportSchema.index({ reporter_id: 1, is_deleted_by_reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporter_id: 1, target_type: 1, target_id: 1, status: 1 });
reportSchema.index({ createdAt: -1 });

export const Report = model<ReportData>('Report', reportSchema);
export type ReportDoc = ReturnType<typeof Report.prototype.toObject> & {
  _id: Types.ObjectId;
};
