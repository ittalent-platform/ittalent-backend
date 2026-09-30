import 'dotenv/config';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Token } from '../models/token.model.js';
import { User } from '../models/user.model.js';

export interface UserEmailVerifiedMigrationResult {
  markedVerified: number;
  markedUnverified: number;
}

/**
 * Backfills `User.email_verified` for accounts created before the field existed.
 * Email verification used to be implied by the status change inactive -> active:
 *  - active   -> verified
 *  - inactive -> not verified
 *  - suspended / blocked -> verified only if the user has a consumed email-verification token
 * Users that already have a value are left untouched, so the script is safe to run again.
 */
export async function migrateUserEmailVerified(): Promise<UserEmailVerifiedMigrationResult> {
  const missing = { email_verified: { $exists: false } };

  const active = await User.collection.updateMany({ ...missing, status: 'active' }, { $set: { email_verified: true } });
  const inactive = await User.collection.updateMany({ ...missing, status: 'inactive' }, { $set: { email_verified: false } });

  const verifiedUserIds = await Token.collection.distinct('user_id', { type: 'email_verification', status: 'used' });
  const viaToken = await User.collection.updateMany({ ...missing, _id: { $in: verifiedUserIds } }, { $set: { email_verified: true } });
  const rest = await User.collection.updateMany(missing, { $set: { email_verified: false } });

  return {
    markedVerified: active.modifiedCount + viaToken.modifiedCount,
    markedUnverified: inactive.modifiedCount + rest.modifiedCount,
  };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const result = await migrateUserEmailVerified();
    console.info(`User email_verified migration complete: markedVerified=${result.markedVerified}, markedUnverified=${result.markedUnverified}`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1]?.endsWith('migrate-user-email-verified.ts') || process.argv[1]?.endsWith('migrate-user-email-verified.js')) {
  main().catch((error) => { console.error('User email_verified migration failed:', error); process.exit(1); });
}
