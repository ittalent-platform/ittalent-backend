import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Application } from '../models/application.model.js';

// BR-APP-008 replaced the unique (applicant, job) index with a partial one. MongoDB refuses to
// create an index whose name exists with different options, so existing databases must sync once.
export async function syncApplicationIndexes(): Promise<string[]> {
  await connectDatabase();
  try {
    return await Application.syncIndexes();
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.endsWith('sync-application-indexes.ts') || process.argv[1]?.endsWith('sync-application-indexes.js');

if (isDirectRun) {
  syncApplicationIndexes()
    .then((dropped) => { console.info(`Application indexes synced. Dropped: ${dropped.length ? dropped.join(', ') : 'none'}`); })
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
