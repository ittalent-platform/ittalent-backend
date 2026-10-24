import { describe, expect, it, vi } from 'vitest';

import type { StorageReconciliationsRepository } from '../../../src/modules/storage-reconciliations/storage-reconciliations.repository.js';
import { StorageReconciliationsService } from '../../../src/modules/storage-reconciliations/storage-reconciliations.service.js';
import type { StorageService } from '../../../src/shared/services/storage.service.js';

describe('StorageReconciliationsService', () => {
  it('marks an idempotent deletion complete', async () => {
    const repository = {
      findDue: vi.fn().mockResolvedValue([{ _id: 'record-1', storage_key: 'owned/key', resource_type: 'image' }]),
      markCompleted: vi.fn().mockResolvedValue(undefined),
      reschedule: vi.fn(),
    } as unknown as StorageReconciliationsRepository;
    const storage = { deleteFile: vi.fn().mockResolvedValue(true) } as unknown as StorageService;
    const service = new StorageReconciliationsService(repository, storage);

    await expect(service.reconcilePending()).resolves.toBe(1);
    expect(repository.markCompleted).toHaveBeenCalledWith('record-1');
    expect(repository.reschedule).not.toHaveBeenCalled();
  });

  it('retains a durable pending record and schedules a retry after deletion failure', async () => {
    const repository = {
      findDue: vi.fn().mockResolvedValue([{ _id: 'record-2', storage_key: 'owned/key', resource_type: 'image' }]),
      markCompleted: vi.fn(),
      reschedule: vi.fn().mockResolvedValue(undefined),
    } as unknown as StorageReconciliationsRepository;
    const storage = { deleteFile: vi.fn().mockResolvedValue(false) } as unknown as StorageService;
    const service = new StorageReconciliationsService(repository, storage);

    await expect(service.reconcilePending()).resolves.toBe(0);
    expect(repository.reschedule).toHaveBeenCalledWith(
      'record-2',
      expect.any(Date),
      'STORAGE_DELETE_FAILED',
    );
  });
});
