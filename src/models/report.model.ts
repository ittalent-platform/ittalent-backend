import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

import {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
} from '../modules/reports/reports.constants.js';

export {
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  type ReportReason,
  type ReportStatus,
  type ReportTargetType,
};

export interface ReportEvidenceFile {
  file_url: string;
  storage_key: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_at: Date;
}

export interface ReportStatusHistoryEntry {
  status: ReportStatus;
  changed_at: Date;
  changed_by: Types.ObjectId;
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
  reporter_id: Types.ObjectId;
  target_type: ReportTargetType;
  target_id: Types.ObjectId;
  target_snapshot: ReportTargetSnapshot;
  reason: ReportReason;
  statement: string;
  evidence_files: ReportEvidenceFile[];
  status: ReportStatus;
  status_history: ReportStatusHistoryEntry[];
  resolution_response?: string | null | undefined;
  withdrawn_at?: Date | null | undefined;
  resolved_at?: Date | null | undefined;
  hidden_by_reporter: boolean;
  hidden_at?: Date | null | undefined;
  idempotency_key?: string | null | undefined;
  createdAt?: Date;
  updatedAt?: Date;
}

const evidenceFileSchema = new Schema<ReportEvidenceFile>(
  {
    file_url: { type: String, required: true },
    storage_key: { type: String, required: true },
    file_name: { type: String, required: true },
    mime_type: { type: String, required: true },
    size: { type: Number, required: true },
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
    target_snapshot: {
      type: targetSnapshotSchema,
      required: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: true,
    },
    statement: {
      type: String,
      required: true,
      trim: true,
    },
    evidence_files: {
      type: [evidenceFileSchema],
      default: [],
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
    resolution_response: {
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

reportSchema.index({ reporter_id: 1, hidden_by_reporter: 1, createdAt: -1 });
reportSchema.index({ reporter_id: 1, target_type: 1, target_id: 1, status: 1 });
reportSchema.index({ target_type: 1, target_id: 1 });

export const Report = model<ReportData>('Report', reportSchema);
export type ReportDoc = ReturnType<typeof Report.prototype.toObject> & {
  _id: Types.ObjectId;
};
