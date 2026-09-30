import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { Account } from '../models/account.model.js';
import { User, type UserDoc } from '../models/user.model.js';
import { AUTH_CONFIG } from '../modules/auth/auth.constants.js';
import { passwordSchema } from '../modules/auth/auth.schemas.js';

export const adminSeedSchema = z.object({
  email: z.string().email(),
  username: z.string().min(AUTH_CONFIG.USERNAME_MIN_LENGTH).max(AUTH_CONFIG.USERNAME_MAX_LENGTH),
  password: passwordSchema,
});

export type AdminSeedInput = z.infer<typeof adminSeedSchema>;

export interface SeedAdminResult {
  user: UserDoc;
  created: boolean;
  promoted: boolean;
}

export async function seedAdmin(input?: Partial<AdminSeedInput>): Promise<SeedAdminResult> {
  const email = (input?.email ?? process.env.ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
  const username = (input?.username ?? process.env.ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const password = input?.password ?? process.env.ADMIN_PASSWORD ?? 'Admin123456!';

  const validated = adminSeedSchema.parse({ email, username, password });
  const passwordHash = await bcrypt.hash(validated.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

  let user = await User.findOne({ email: validated.email });
  let created = false;
  let promoted = false;

  if (!user) {
    const existingWithUsername = await User.findOne({ username: validated.username });
    if (existingWithUsername) {
      throw new Error(
        `Username '${validated.username}' is already taken by another account (${existingWithUsername.email}).`,
      );
    }

    user = await User.create({
      email: validated.email,
      username: validated.username,
      role: 'admin',
      status: 'active',
      email_verified: true,
    });
    created = true;
  } else {
    if (user.role !== 'admin' || user.status !== 'active' || !user.email_verified) {
      user.role = 'admin';
      user.status = 'active';
      user.email_verified = true;
      await user.save();
      promoted = true;
    }
  }

  const existingAccount = await Account.findOne({ user_id: user._id, provider: 'local' });
  if (existingAccount) {
    existingAccount.password_hash = passwordHash;
    await existingAccount.save();
  } else {
    await Account.create({
      user_id: user._id,
      provider: 'local',
      password_hash: passwordHash,
    });
  }

  return { user, created, promoted };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const result = await seedAdmin();
    if (result.created) {
      console.info(`Admin account created successfully: ${result.user.email} (${result.user.username})`);
    } else if (result.promoted) {
      console.info(`Existing account promoted to active admin: ${result.user.email} (${result.user.username})`);
    } else {
      console.info(`Admin account verified and credentials updated: ${result.user.email} (${result.user.username})`);
    }
  } finally {
    await disconnectDatabase();
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('seed-admin.ts') ||
  process.argv[1]?.endsWith('seed-admin.js');

if (isDirectRun) {
  main().catch((error) => {
    console.error('Failed to seed admin account:', error);
    process.exit(1);
  });
}
