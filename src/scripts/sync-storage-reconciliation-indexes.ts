import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { StorageReconciliation } from '../models/storage-reconciliation.model.js';

async function syncStorageReconciliationIndexes(): Promise<void> {
  await connectDatabase();
  await StorageReconciliation.syncIndexes();
  await disconnectDatabase();
}

syncStorageReconciliationIndexes().catch(async (error: unknown) => {
  console.error('Failed to synchronize storage reconciliation indexes', {
    message: error instanceof Error ? error.message : 'Unknown index synchronization failure',
  });
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
