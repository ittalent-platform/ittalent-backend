import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Enterprise } from '../models/enterprise.model.js';
import { User } from '../models/user.model.js';

export interface EnterpriseRecruiterMigrationResult {
  assigned: number;
  alreadyAssigned: number;
  skippedMissingOrNonRecruiter: number;
  conflicts: number;
  legacyFieldsRemoved: number;
  pendingLegacyFields: number;
}

/**
 * Backfills the inverse ownership relation before removing the legacy array.
 * An enterprise array is retained only when a conflicting record needs manual resolution.
 */
export async function migrateEnterpriseRecruiters(): Promise<EnterpriseRecruiterMigrationResult> {
  const enterprises = await Enterprise.collection.find({ recruiter_ids: { $exists: true } }).toArray();
  const result: EnterpriseRecruiterMigrationResult = {
    assigned: 0,
    alreadyAssigned: 0,
    skippedMissingOrNonRecruiter: 0,
    conflicts: 0,
    legacyFieldsRemoved: 0,
    pendingLegacyFields: 0,
  };

  for (const enterprise of enterprises) {
    const legacyRecruiterIds = Array.isArray(enterprise.recruiter_ids) ? enterprise.recruiter_ids : [];
    const legacyIds = new Map<string, unknown>();
    for (const recruiterId of legacyRecruiterIds) {
      legacyIds.set(String(recruiterId), recruiterId);
    }
    if (enterprise.creator_account_id) {
      legacyIds.set(String(enterprise.creator_account_id), enterprise.creator_account_id);
    }

    let canRemoveLegacyField = true;
    for (const recruiterId of legacyIds.values()) {
      const recruiter = await User.findById(recruiterId).select('role enterprise_id').exec();
      if (!recruiter || recruiter.role !== 'recruiter') {
        result.skippedMissingOrNonRecruiter += 1;
        canRemoveLegacyField = false;
        continue;
      }

      if (recruiter.enterprise_id && String(recruiter.enterprise_id) !== String(enterprise._id)) {
        result.conflicts += 1;
        canRemoveLegacyField = false;
        continue;
      }

      if (recruiter.enterprise_id) {
        result.alreadyAssigned += 1;
      } else {
        recruiter.enterprise_id = enterprise._id;
        await recruiter.save();
        result.assigned += 1;
      }
    }

    if (canRemoveLegacyField) {
      await Enterprise.collection.updateOne({ _id: enterprise._id }, { $unset: { recruiter_ids: '' } });
      result.legacyFieldsRemoved += 1;
    } else {
      result.pendingLegacyFields += 1;
    }
  }

  return result;
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const result = await migrateEnterpriseRecruiters();
    console.info(`Enterprise recruiter migration complete: assigned=${result.assigned}, alreadyAssigned=${result.alreadyAssigned}, skipped=${result.skippedMissingOrNonRecruiter}, conflicts=${result.conflicts}, removed=${result.legacyFieldsRemoved}, pending=${result.pendingLegacyFields}`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1]?.endsWith('migrate-enterprise-recruiters.ts') || process.argv[1]?.endsWith('migrate-enterprise-recruiters.js')) {
  main().catch((error) => { console.error('Enterprise recruiter migration failed:', error); process.exit(1); });
}
