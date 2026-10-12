import type { ClientSession, Types } from 'mongoose';

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

export class UserEmailChangesRepository {
  async create(data: CreateEmailChangeInput, session: ClientSession): Promise<void> {
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
  }

  async findPendingByHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    return UserEmailChange.findOne({ token_hash: tokenHash, status: 'pending', expires_at: { $gt: new Date() } })
      .select('+token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
  }

  async complete(requestId: Types.ObjectId, targetUserId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const result = await UserEmailChange.updateOne(
      { _id: requestId, target_user_id: targetUserId, status: 'pending', expires_at: { $gt: new Date() } },
      { $set: { status: 'completed', completed_at: new Date() } },
      { session },
    ).exec();
    return result.modifiedCount === 1;
  }
}

export const userEmailChangesRepository = new UserEmailChangesRepository();
