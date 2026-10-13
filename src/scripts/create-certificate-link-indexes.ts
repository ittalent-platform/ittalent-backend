import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { CertificateLink } from '../models/certificate-link.model.js';

export async function createCertificateLinkIndexes(): Promise<void> {
  await connectDatabase();
  try {
    await CertificateLink.createIndexes();
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.endsWith('create-certificate-link-indexes.ts')
  || process.argv[1]?.endsWith('create-certificate-link-indexes.js');

if (isDirectRun) {
  createCertificateLinkIndexes()
    .then(() => { console.info('Certificate link indexes ensured.'); })
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
