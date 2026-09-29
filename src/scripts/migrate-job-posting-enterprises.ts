import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Enterprise } from '../models/enterprise.model.js';
import { JobPosting } from '../models/job-posting.model.js';

export interface JobPostingEnterpriseMigrationResult {
  migrated: number;
  skipped: number;
}

export async function migrateJobPostingEnterprises(): Promise<JobPostingEnterpriseMigrationResult> {
  const legacyJobs = await JobPosting.find({ enterprise_id: { $exists: false } }).exec();
  let migrated = 0;
  let skipped = 0;

  for (const job of legacyJobs) {
    const enterprises = await Enterprise.find({
      is_deleted: false,
      $or: [{ creator_account_id: job.posted_by_user_id }, { recruiter_ids: job.posted_by_user_id }],
    }).select('_id').exec();

    if (enterprises.length !== 1) {
      skipped += 1;
      continue;
    }

    const [enterprise] = enterprises;
    if (!enterprise) {
      skipped += 1;
      continue;
    }

    await JobPosting.updateOne({ _id: job._id, enterprise_id: { $exists: false } }, { $set: { enterprise_id: enterprise._id } }).exec();
    migrated += 1;
  }

  return { migrated, skipped };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const result = await migrateJobPostingEnterprises();
    console.info(`Job posting enterprise migration complete: migrated=${result.migrated}, skipped=${result.skipped}`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1]?.endsWith('migrate-job-posting-enterprises.ts') || process.argv[1]?.endsWith('migrate-job-posting-enterprises.js')) {
  main().catch((error) => { console.error('Job posting enterprise migration failed:', error); process.exit(1); });
}
