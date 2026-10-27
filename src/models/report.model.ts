import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import {
  REPORT_ACTIONS_TAKEN,
  REPORT_REASON_CATEGORIES,
  REPORT_REASONS,
  REPORT_RESOLUTION_DECISIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  reportActionsTaken,
  reportReasonCategories,
  reportResolutionDecisions,
  reportStatuses,
  reportTargetTypes,
  type ReportActionTaken,
  type ReportReason,
  type ReportReasonCategory,
  type ReportResolutionDecision,
  type ReportStatus,
  type ReportTargetType,
} from '../modules/reports/reports.constants.js';

export {
  REPORT_ACTIONS_TAKEN,
  REPORT_REASON_CATEGORIES,
  REPORT_REASONS,
  REPORT_RESOLUTION_DECISIONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  reportActionsTaken,
  reportReasonCategories,
  reportResolutionDecisions,
  reportStatuses,
  reportTargetTypes,
  type ReportActionTaken,
  type ReportReason,
  type ReportReasonCategory,
  type ReportResolutionDecision,
  type ReportStatus,
  type ReportTargetType,
};

export interface ReportEvidenceFile {
  file_url: string;
  storage_key?: string | undefined;
  file_name?: string | undefined;
  mime_type?: string | undefined;
  size?: number | undefined;
  uploaded_at?: Date | undefined;
}

export interface ReportStatusHistoryEntry {
  status: ReportStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
  note?: string | null | undefined;
}

export interface ReportTimelineEvent {
  status: ReportStatus;
  timestamp: Date;
  actor_id?: Types.ObjectId | null | undefined;
  note?: string | null | undefined;
}

export interface ReportTargetSnapshot {
  title: string;
  subtitle: string;
  enterprise_id?: Types.ObjectId | null | undefined;
  enterprise_name?: string | null | undefined;
}

export interface ReportData {
  reference: string;
  ticket_id?: string | undefined;
  reporter_id: Types.ObjectId;
  target_type: ReportTargetType;
  target_id: Types.ObjectId;
  target_title?: string | undefined;
  target_link?: string | null | undefined;
  target_snapshot?: ReportTargetSnapshot | undefined;
  reason: ReportReason;
  reason_category?: ReportReasonCategory | string | undefined;
  title?: string | undefined;
  statement: string;
  description?: string | undefined;
  evidence_files: ReportEvidenceFile[];
  is_anonymous?: boolean | undefined;
  status: ReportStatus;
  status_history?: ReportStatusHistoryEntry[] | undefined;
  timeline?: ReportTimelineEvent[] | undefined;
  withdrawal_reason?: string | null | undefined;
  withdrawn_at?: Date | null | undefined;
  hidden_by_reporter: boolean;
  hidden_at?: Date | null | undefined;
  is_deleted_by_reporter?: boolean | undefined;
  deleted_by_reporter_at?: Date | null | undefined;
  idempotency_key?: string | null | undefined;
  assigned_admin_id?: Types.ObjectId | null | undefined;
  reviewed_at?: Date | null | undefined;
  resolution_decision?: ReportResolutionDecision | null | undefined;
  action_taken?: ReportActionTaken | null | undefined;
  internal_notes?: string | null | undefined;
  message_to_reporter?: string | null | undefined;
  resolution_response?: string | null | undefined;
  resolved_at?: Date | null | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

const evidenceFileSchema = new Schema<ReportEvidenceFile>(
  {
    file_url: { type: String, required: true },
    storage_key: { type: String, default: '' },
    file_name: { type: String, default: '' },
    mime_type: { type: String, default: '' },
    size: { type: Number, default: 0 },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const statusHistorySchema = new Schema<ReportStatusHistoryEntry>(
  {
    status: {
      type: String,
      enum: REPORT_STATUSES,
      required: true,
    },
    changed_at: {
      type: Date,
      default: Date.now,
    },
    changed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    note: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const reportTimelineSchema = new Schema<ReportTimelineEvent>(
  {
    status: { type: String, enum: REPORT_STATUSES, required: true },
    timestamp: { type: Date, default: Date.now, required: true },
    actor_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: null },
  },
  { _id: false },
);

const targetSnapshotSchema = new Schema<ReportTargetSnapshot>(
  {
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
    enterprise_id: { type: Schema.Types.ObjectId, ref: 'Enterprise', default: null },
    enterprise_name: { type: String, default: null },
  },
  { _id: false },
);

export const reportSchema = new Schema<ReportData>(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    ticket_id: {
      type: String,
      index: true,
      sparse: true,
      trim: true,
    },
    reporter_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    target_type: {
      type: String,
      enum: REPORT_TARGET_TYPES,
      required: true,
      index: true,
    },
    target_id: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    target_title: {
      type: String,
      trim: true,
      default: '',
    },
    target_link: {
      type: String,
      default: null,
      trim: true,
    },
    target_snapshot: {
      type: targetSnapshotSchema,
      default: null,
    },
    reason: {
      type: String,
      required: true,
    },
    reason_category: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: '',
    },
    statement: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    evidence_files: {
      type: [evidenceFileSchema],
      default: [],
    },
    is_anonymous: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: 'pending',
      index: true,
    },
    status_history: {
      type: [statusHistorySchema],
      default: [],
    },
    timeline: {
      type: [reportTimelineSchema],
      default: [],
    },
    withdrawal_reason: {
      type: String,
      default: null,
    },
    withdrawn_at: {
      type: Date,
      default: null,
    },
    resolved_at: {
      type: Date,
      default: null,
    },
    hidden_by_reporter: {
      type: Boolean,
      default: false,
      index: true,
    },
    hidden_at: {
      type: Date,
      default: null,
    },
    is_deleted_by_reporter: {
      type: Boolean,
      default: false,
      index: true,
    },
    deleted_by_reporter_at: {
      type: Date,
      default: null,
    },
    assigned_admin_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
    resolution_decision: {
      type: String,
      enum: REPORT_RESOLUTION_DECISIONS,
      default: null,
    },
    action_taken: {
      type: String,
      enum: REPORT_ACTIONS_TAKEN,
      default: null,
    },
    internal_notes: {
      type: String,
      default: null,
      maxlength: 1000,
    },
    message_to_reporter: {
      type: String,
      default: null,
      maxlength: 500,
    },
    resolution_response: {
      type: String,
      default: null,
    },
    idempotency_key: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'reports',
  },
);

reportSchema.pre('save', function syncFields() {
  if (!this.ticket_id && this.reference) {
    this.ticket_id = this.reference;
  } else if (!this.reference && this.ticket_id) {
    this.reference = this.ticket_id;
  }
  if (!this.description && this.statement) {
    this.description = this.statement;
  } else if (!this.statement && this.description) {
    this.statement = this.description;
  }
  if (!this.reason_category && this.reason) {
    this.reason_category = this.reason;
  }
  if (!this.resolution_response && this.message_to_reporter) {
    this.resolution_response = this.message_to_reporter;
  } else if (!this.message_to_reporter && this.resolution_response) {
    this.message_to_reporter = this.resolution_response;
  }
  if (this.hidden_by_reporter && !this.is_deleted_by_reporter) {
    this.is_deleted_by_reporter = true;
    this.deleted_by_reporter_at = this.hidden_at ?? new Date();
  } else if (this.is_deleted_by_reporter && !this.hidden_by_reporter) {
    this.hidden_by_reporter = true;
    this.hidden_at = this.deleted_by_reporter_at ?? new Date();
  }
});

reportSchema.index({ reporter_id: 1, hidden_by_reporter: 1, createdAt: -1 });
reportSchema.index({ reporter_id: 1, is_deleted_by_reporter: 1, createdAt: -1 });
reportSchema.index({ reporter_id: 1, target_type: 1, target_id: 1, status: 1 });
reportSchema.index({ target_type: 1, target_id: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ createdAt: -1 });

export const Report = model<ReportData>('Report', reportSchema);
export type ReportDoc = ReturnType<typeof Report.prototype.toObject> & {
  _id: Types.ObjectId;
};
