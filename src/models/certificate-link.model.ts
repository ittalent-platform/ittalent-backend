import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const certificateLinkStatuses = ['available'] as const;
export type CertificateLinkStatus = (typeof certificateLinkStatuses)[number];

export const certificateLinkHistoryActions = ['created', 'updated', 'suggestion_changed'] as const;

export interface CertificateLinkHistoryEntry {
  actor_id: Types.ObjectId;
  action: (typeof certificateLinkHistoryActions)[number];
  occurred_at: Date;
  result: 'success';
  version: number;
}

export interface CertificateLinkData {
  owner_id: Types.ObjectId;
  name: string;
  url: string;
  issuer?: string;
  issued_date?: string;
  expiry_date?: string;
  version: number;
  status: CertificateLinkStatus;
  suggested: boolean;
  idempotency_key: string;
  request_hash: string;
  history: CertificateLinkHistoryEntry[];
}

const historyEntrySchema = new Schema<CertificateLinkHistoryEntry>(
  {
    actor_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: certificateLinkHistoryActions, required: true },
    occurred_at: { type: Date, required: true },
    result: { type: String, enum: ['success'], required: true },
    version: { type: Number, required: true },
  },
  { _id: false },
);

const certificateLinkSchema = new Schema<CertificateLinkData>(
  {
    owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    issuer: { type: String, trim: true },
    issued_date: { type: String },
    expiry_date: { type: String },
    version: { type: Number, required: true, default: 1 },
    status: { type: String, enum: certificateLinkStatuses, required: true, default: 'available' },
    suggested: { type: Boolean, default: false, required: true },
    idempotency_key: { type: String, required: true, select: false },
    request_hash: { type: String, required: true, select: false },
    history: { type: [historyEntrySchema], required: true },
  },
  { timestamps: true, collection: 'certificate_links' },
);

certificateLinkSchema.index({ owner_id: 1, url: 1 }, { unique: true });
certificateLinkSchema.index({ owner_id: 1, idempotency_key: 1 }, { unique: true });
certificateLinkSchema.index({ owner_id: 1, status: 1, createdAt: -1, _id: -1 });

export const CertificateLink = model<CertificateLinkData>('CertificateLink', certificateLinkSchema);
export type CertificateLinkDoc = ReturnType<typeof CertificateLink.prototype.toObject> & { _id: Types.ObjectId };
