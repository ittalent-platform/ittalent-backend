import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';
import { Token } from '../../src/models/token.model.js';
import { User } from '../../src/models/user.model.js';
import { migrateUserEmailVerified } from '../../src/scripts/migrate-user-email-verified.js';

const tag = `mig${new Types.ObjectId().toHexString().slice(-8)}`;
const ids: Record<string, Types.ObjectId> = {};

async function insert(name: string, fields: Record<string, unknown>): Promise<void> {
  ids[name] = new Types.ObjectId();
  await User.collection.insertOne({
    _id: ids[name],
    email: `${tag}-${name}@example.test`,
    username: `${tag}-${name}`,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...fields,
  });
}

const verifiedOf = async (name: string) => (await User.collection.findOne({ _id: ids[name] as Types.ObjectId }))?.email_verified;

describe('migrate:user-email-verified (integration)', () => {
  beforeAll(async () => {
    await connectDatabase();
    await insert('active', { status: 'active' });
    await insert('inactive', { status: 'inactive' });
    await insert('blocked-verified', { status: 'blocked' });
    await insert('blocked-never', { status: 'blocked' });
    await insert('suspended-verified', { status: 'suspended' });
    await insert('already-false', { status: 'active', email_verified: false });
    await insert('already-true', { status: 'inactive', email_verified: true });
    for (const name of ['blocked-verified', 'suspended-verified']) {
      await Token.collection.insertOne({ user_id: ids[name], type: 'email_verification', token_hash: `${tag}-${name}`, status: 'used', expires_at: new Date() });
    }
    // A consumed password-reset token proves nothing about the email address.
    await Token.collection.insertOne({ user_id: ids['blocked-never'], type: 'password_reset', token_hash: `${tag}-reset`, status: 'used', expires_at: new Date() });
  });

  afterAll(async () => {
    await User.collection.deleteMany({ _id: { $in: Object.values(ids) } });
    await Token.collection.deleteMany({ token_hash: { $regex: `^${tag}` } });
    await disconnectDatabase();
  });

  it('backfills from the old status rules and consumed verification tokens', async () => {
    await migrateUserEmailVerified();

    expect(await verifiedOf('active')).toBe(true);
    expect(await verifiedOf('inactive')).toBe(false);
    expect(await verifiedOf('blocked-verified')).toBe(true);
    expect(await verifiedOf('suspended-verified')).toBe(true);
    expect(await verifiedOf('blocked-never')).toBe(false);
  });

  it('never overwrites a value that is already set, and is safe to run again', async () => {
    const again = await migrateUserEmailVerified();

    expect(await verifiedOf('already-false')).toBe(false);
    expect(await verifiedOf('already-true')).toBe(true);
    expect(await verifiedOf('active')).toBe(true);
    expect(again.markedVerified + again.markedUnverified).toBe(0);
  });
});
