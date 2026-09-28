import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { Account } from '../../src/models/account.model.js';
import { User } from '../../src/models/user.model.js';
import { seedAdmin } from '../../src/scripts/seed-admin.js';

describe('seedAdmin script', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Account.deleteMany({});
  });

  it('creates a new active admin user and local account when user does not exist', async () => {
    const result = await seedAdmin({
      email: 'newadmin@example.com',
      username: 'newadmin',
      password: 'AdminPassword123!',
    });

    expect(result.created).toBe(true);
    expect(result.promoted).toBe(false);

    const user = await User.findOne({ email: 'newadmin@example.com' });
    expect(user).toBeDefined();
    expect(user?.role).toBe('admin');
    expect(user?.status).toBe('active');
    expect(user?.username).toBe('newadmin');

    const account = await Account.findOne({ user_id: user!._id, provider: 'local' }).select('+password_hash').lean();
    expect(account).toBeDefined();
    expect(account?.password_hash).toBeDefined();

    const isPasswordMatch = await bcrypt.compare('AdminPassword123!', account?.password_hash ?? '');
    expect(isPasswordMatch).toBe(true);
  });

  it('promotes an existing regular inactive user to active admin and updates password', async () => {
    const oldPasswordHash = await bcrypt.hash('OldPassword123!', 10);
    const existingUser = await User.create({
      email: 'member@example.com',
      username: 'member',
      role: 'user',
      status: 'inactive',
    });
    await Account.create({
      user_id: existingUser._id,
      provider: 'local',
      password_hash: oldPasswordHash,
    });

    const result = await seedAdmin({
      email: 'member@example.com',
      username: 'member',
      password: 'NewAdminPassword123!',
    });

    expect(result.created).toBe(false);
    expect(result.promoted).toBe(true);

    const updatedUser = await User.findById(existingUser._id);
    expect(updatedUser?.role).toBe('admin');
    expect(updatedUser?.status).toBe('active');

    const account = await Account.findOne({ user_id: existingUser._id, provider: 'local' }).select('+password_hash').lean();
    const isNewPasswordMatch = await bcrypt.compare('NewAdminPassword123!', account?.password_hash ?? '');
    expect(isNewPasswordMatch).toBe(true);
  });

  it('is idempotent when admin is already configured', async () => {
    const firstResult = await seedAdmin({
      email: 'idempotent@example.com',
      username: 'idempotent',
      password: 'AdminPassword123!',
    });
    expect(firstResult.created).toBe(true);

    const secondResult = await seedAdmin({
      email: 'idempotent@example.com',
      username: 'idempotent',
      password: 'AdminPassword123!',
    });
    expect(secondResult.created).toBe(false);
    expect(secondResult.promoted).toBe(false);

    const usersCount = await User.countDocuments({ email: 'idempotent@example.com' });
    expect(usersCount).toBe(1);
  });

  it('throws an error if username is already taken by another account', async () => {
    await User.create({
      email: 'other@example.com',
      username: 'admin',
      role: 'user',
      status: 'active',
    });

    await expect(
      seedAdmin({
        email: 'different@example.com',
        username: 'admin',
        password: 'AdminPassword123!',
      }),
    ).rejects.toThrow("Username 'admin' is already taken by another account (other@example.com).");
  });
});
