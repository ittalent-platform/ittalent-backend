import 'dotenv/config';
import bcrypt from 'bcryptjs';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Account } from '../models/account.model.js';
import { Enterprise } from '../models/enterprise.model.js';
import { User, type UserDoc } from '../models/user.model.js';
import { AUTH_CONFIG } from '../modules/auth/auth.constants.js';

const RECRUITER_EMAIL = 'recruiter@gmail.com';
const RECRUITER_USERNAME = 'recruiter';
const RECRUITER_PASSWORD = process.env.RECRUITER_PASSWORD ?? '12345678';
const ENTERPRISE_NAME = 'IT Talent Enterprise';
const ENTERPRISE_TAX_CODE = '9999999999';

export interface SeedRecruiterResult {
  enterpriseId: string;
  enterpriseName: string;
  recruiter: UserDoc;
}

export async function seedRecruiter(): Promise<SeedRecruiterResult> {
  const passwordHash = await bcrypt.hash(RECRUITER_PASSWORD, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
  let recruiter = await User.findOne({ email: RECRUITER_EMAIL });
  if (!recruiter) {
    recruiter = await User.create({ email: RECRUITER_EMAIL, username: RECRUITER_USERNAME, role: 'recruiter', status: 'active' });
  } else {
    recruiter.role = 'recruiter';
    recruiter.status = 'active';
    await recruiter.save();
  }

  const assignedElsewhere = await Enterprise.findOne({
    is_deleted: false,
    $or: [{ creator_account_id: recruiter._id }, { recruiter_ids: recruiter._id }],
    tax_code: { $ne: ENTERPRISE_TAX_CODE },
  });
  if (assignedElsewhere) {
    throw new Error(`Recruiter is already assigned to enterprise ${assignedElsewhere._id}`);
  }

  let enterprise = await Enterprise.findOne({ tax_code: ENTERPRISE_TAX_CODE, is_deleted: false });
  if (!enterprise) {
    enterprise = await Enterprise.create({
      name: ENTERPRISE_NAME,
      tax_code: ENTERPRISE_TAX_CODE,
      email: 'recruiter@ittalent.example',
      phone: '+84900000000',
      industry: 'Information Technology',
      company_size: '1-10',
      address: { street: '1 Test Street', city: 'Ho Chi Minh City', country: 'Vietnam' },
      status: 'active',
      creator_account_id: recruiter._id,
      recruiter_ids: [recruiter._id],
      is_deleted: false,
    });
  } else if (!(enterprise.recruiter_ids ?? []).some((id) => String(id) === String(recruiter._id))) {
    enterprise.recruiter_ids = [...(enterprise.recruiter_ids ?? []), recruiter._id];
    await enterprise.save();
  }

  const account = await Account.findOne({ user_id: recruiter._id, provider: 'local' }).select('+password_hash');
  if (account) {
    account.password_hash = passwordHash;
    await account.save();
  } else {
    await Account.create({ user_id: recruiter._id, provider: 'local', password_hash: passwordHash });
  }
  return { enterpriseId: String(enterprise._id), enterpriseName: enterprise.name, recruiter };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const result = await seedRecruiter();
    console.info(`Recruiter seed complete: ${result.recruiter.email} -> ${result.enterpriseName} (${result.enterpriseId})`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1]?.endsWith('seed-recruiter.ts') || process.argv[1]?.endsWith('seed-recruiter.js')) {
  main().catch((error) => { console.error('Failed to seed recruiter:', error); process.exit(1); });
}
