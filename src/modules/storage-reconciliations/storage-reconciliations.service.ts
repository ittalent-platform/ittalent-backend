import type { ClientSession } from 'mongoose';

import { env } from '../../config/env.js';
import { storageService, type StorageService } from '../../shared/services/storage.service.js';
import {
  STORAGE_RECONCILIATION_BATCH_SIZE,
  STORAGE_RECONCILIATION_ERROR_CODES,
} from './storage-reconciliations.constants.js';
import {
  storageReconciliationsRepository,
  type ScheduleStorageReconciliationInput,
  type StorageReconciliationsRepository,
} from './storage-reconciliations.repository.js';

export class StorageReconciliationsService {
  constructor(
    private readonly repository: StorageReconciliationsRepository = storageReconciliationsRepository,
    private readonly storage: StorageService = storageService,
  ) {}

  schedule(input: ScheduleStorageReconciliationInput, session?: ClientSession): Promise<void> {
    return this.repository.schedule(input, session);
  }

  markCompleted(storageKey: string): Promise<void> {
    return this.repository.markCompletedByKey(storageKey);
  }

  async reconcilePending(): Promise<number> {
    const records = await this.repository.findDue(STORAGE_RECONCILIATION_BATCH_SIZE);
    let completed = 0;
    for (const record of records) {
      const deleted = await this.storage.deleteFile(record.storage_key, record.resource_type);
      if (deleted) {
        await this.repository.markCompleted(String(record._id));
        completed += 1;
      } else {
        await this.repository.reschedule(
          String(record._id),
          new Date(Date.now() + env.STORAGE_RECONCILIATION_INTERVAL_MS),
          STORAGE_RECONCILIATION_ERROR_CODES.DELETE_FAILED,
        );
      }
    }
    return completed;
  }

  startJob(): () => void {
    const timer = setInterval(() => {
      void this.reconcilePending().catch((error: unknown) => {
        console.error('[storage-reconciliation:error]', {
          message: error instanceof Error ? error.message : 'Unknown reconciliation failure',
        });
      });
    }, env.STORAGE_RECONCILIATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }
}

export const storageReconciliationsService = new StorageReconciliationsService();
