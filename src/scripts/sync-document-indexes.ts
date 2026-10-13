import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Document } from '../models/document.model.js';

async function syncDocumentIndexes(): Promise<void> {
  await connectDatabase();
  await Document.syncIndexes();
  await disconnectDatabase();
}

syncDocumentIndexes().catch(async (error: unknown) => {
  console.error('Failed to synchronize document indexes', error);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
