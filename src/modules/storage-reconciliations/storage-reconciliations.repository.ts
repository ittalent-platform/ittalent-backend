import type { ClientSession } from 'mongoose';

import {
  StorageReconciliation,
  type StorageReconciliationDoc,
  type StorageReconciliationReason,
} from '../../models/storage-reconciliation.model.js';

export interface ScheduleStorageReconciliationInput {
  storageKey: string;
  reason: StorageReconciliationReason;
}

export class StorageReconciliationsRepository {
  async schedule(input: ScheduleStorageReconciliationInput, session?: ClientSession): Promise<void> {
    await StorageReconciliation.updateOne(
      { storage_key: input.storageKey },
      {
        $setOnInsert: {
          storage_key: input.storageKey,
          resource_type: 'image',
          reason: input.reason,
          status: 'pending',
          attempt_count: 0,
          next_attempt_at: new Date(),
        },
      },
      { upsert: true, ...(session ? { session } : {}) },
    ).exec();
  }

  findDue(limit: number): Promise<StorageReconciliationDoc[]> {
    return StorageReconciliation.find({ status: 'pending', next_attempt_at: { $lte: new Date() } })
      .sort({ next_attempt_at: 1, _id: 1 })
      .limit(limit)
      .exec() as Promise<StorageReconciliationDoc[]>;
  }

  async markCompleted(id: string): Promise<void> {
    await StorageReconciliation.updateOne(
      { _id: id, status: 'pending' },
      { $set: { status: 'completed', completed_at: new Date(), last_error_code: null } },
    ).exec();
  }

  async markCompletedByKey(storageKey: string): Promise<void> {
    await StorageReconciliation.updateOne(
      { storage_key: storageKey, status: 'pending' },
      { $set: { status: 'completed', completed_at: new Date(), last_error_code: null } },
    ).exec();
  }

  async reschedule(id: string, nextAttemptAt: Date, errorCode: string): Promise<void> {
    await StorageReconciliation.updateOne(
      { _id: id, status: 'pending' },
      { $inc: { attempt_count: 1 }, $set: { next_attempt_at: nextAttemptAt, last_error_code: errorCode } },
    ).exec();
  }
}

export const storageReconciliationsRepository = new StorageReconciliationsRepository();
