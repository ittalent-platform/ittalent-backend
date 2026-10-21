import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { PortfolioLink } from '../models/portfolio-link.model.js';

export async function createPortfolioLinkIndexes(): Promise<void> {
  await connectDatabase();
  try {
    await PortfolioLink.createIndexes();
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun = process.argv[1]?.endsWith('create-portfolio-link-indexes.ts')
  || process.argv[1]?.endsWith('create-portfolio-link-indexes.js');

if (isDirectRun) {
  createPortfolioLinkIndexes()
    .then(() => { console.info('Portfolio link indexes ensured.'); })
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
