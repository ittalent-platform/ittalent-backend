import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const storageReconciliationReasons = ['orphaned_upload', 'displaced_asset'] as const;
export type StorageReconciliationReason = (typeof storageReconciliationReasons)[number];

export interface StorageReconciliationData {
  storage_key: string;
  resource_type: 'image';
  reason: StorageReconciliationReason;
  status: 'pending' | 'completed';
  attempt_count: number;
  next_attempt_at: Date;
  completed_at?: Date | null;
  last_error_code?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const storageReconciliationSchema = new Schema<StorageReconciliationData>(
  {
    storage_key: { type: String, required: true, unique: true, index: true },
    resource_type: { type: String, enum: ['image'], required: true },
    reason: { type: String, enum: storageReconciliationReasons, required: true },
    status: { type: String, enum: ['pending', 'completed'], required: true, default: 'pending' },
    attempt_count: { type: Number, required: true, default: 0 },
    next_attempt_at: { type: Date, required: true, default: Date.now },
    completed_at: { type: Date, default: null },
    last_error_code: { type: String, default: null },
  },
  { timestamps: true, collection: 'storage_reconciliations' },
);

storageReconciliationSchema.index({ status: 1, next_attempt_at: 1 });

export const StorageReconciliation = model('StorageReconciliation', storageReconciliationSchema);
export type StorageReconciliationDoc = ReturnType<typeof StorageReconciliation.prototype.toObject> & { _id: Types.ObjectId };
