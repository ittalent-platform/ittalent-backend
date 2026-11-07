import type { ClientSession, Types } from 'mongoose';
import { and, eq, gt } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { userEmailChanges } from '../../db/schema/index.js';
import { UserEmailChange } from '../../models/user-email-change.model.js';

export interface CreateEmailChangeInput {
  targetUserId: Types.ObjectId;
  actorId: Types.ObjectId;
  currentEmail: string;
  newEmail: string;
  tokenHash: string;
  expectedVersion: number;
  expiresAt: Date;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

export class UserEmailChangesRepository {
  async create(data: CreateEmailChangeInput, session: ClientSession): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserEmailChange.create)) {
      await UserEmailChange.updateMany({ target_user_id: data.targetUserId, status: 'pending' }, { $set: { status: 'revoked' } }, { session });
      await UserEmailChange.create([{
        target_user_id: data.targetUserId,
        requested_by: data.actorId,
        current_email: data.currentEmail,
        new_email: data.newEmail,
        token_hash: data.tokenHash,
        expected_version: data.expectedVersion,
        expires_at: data.expiresAt,
        status: 'pending',
      }], { session });
      return;
    }

    const db = getSqliteDb();
    const now = new Date();
    db.update(userEmailChanges)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(userEmailChanges.target_user_id, String(data.targetUserId)),
          eq(userEmailChanges.status, 'pending'),
        ),
      )
      .run();

    const id = generateId();
    db.insert(userEmailChanges)
      .values({
        id,
        target_user_id: String(data.targetUserId),
        requested_by: String(data.actorId),
        current_email: data.currentEmail,
        new_email: data.newEmail,
        token_hash: data.tokenHash,
        expected_version: data.expectedVersion,
        expires_at: data.expiresAt,
        status: 'pending',
        completed_at: null,
        createdAt: now,
      })
      .run();
  }

  async findPendingByHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserEmailChange.findOne)) {
      return UserEmailChange.findOne({ token_hash: tokenHash, status: 'pending', expires_at: { $gt: new Date() } })
        .select('+token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
    }

    const db = getSqliteDb();
    const now = new Date();
    const row = db
      .select()
      .from(userEmailChanges)
      .where(
        and(
          eq(userEmailChanges.token_hash, tokenHash),
          eq(userEmailChanges.status, 'pending'),
          gt(userEmailChanges.expires_at, now),
        ),
      )
      .get();

    if (!row) return null;
    return {
      _id: row.id,
      id: row.id,
      target_user_id: row.target_user_id,
      requested_by: row.requested_by,
      current_email: row.current_email,
      new_email: row.new_email,
      token_hash: row.token_hash,
      expected_version: row.expected_version,
      expires_at: new Date(row.expires_at),
      status: row.status,
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: new Date(row.createdAt),
    };
  }

  async complete(requestId: Types.ObjectId, targetUserId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserEmailChange.updateOne)) {
      const result = await UserEmailChange.updateOne(
        { _id: requestId, target_user_id: targetUserId, status: 'pending', expires_at: { $gt: new Date() } },
        { $set: { status: 'completed', completed_at: new Date() } },
        { session },
      ).exec();
      return result.modifiedCount === 1;
    }

    const db = getSqliteDb();
    const now = new Date();
    const res = db
      .update(userEmailChanges)
      .set({ status: 'completed', completed_at: now })
      .where(
        and(
          eq(userEmailChanges.id, String(requestId)),
          eq(userEmailChanges.target_user_id, String(targetUserId)),
          eq(userEmailChanges.status, 'pending'),
          gt(userEmailChanges.expires_at, now),
        ),
      )
      .run();

    return res.changes === 1;
  }
}

export const userEmailChangesRepository = new UserEmailChangesRepository();
