import type { ClientSession, Types } from 'mongoose';

import { UserInvitation, type UserInvitationKind, type UserInvitationRole } from '../../models/user-invitation.model.js';

export interface CreateInvitationRecord {
  targetUserId: Types.ObjectId;
  actorId: Types.ObjectId;
  kind: UserInvitationKind;
  role: UserInvitationRole;
  enterpriseId: Types.ObjectId | null;
  tokenHash: string;
  expiresAt: Date;
}

export class UserInvitationsRepository {
  async create(data: CreateInvitationRecord, session: ClientSession): Promise<void> {
    await UserInvitation.updateMany(
      { target_user_id: data.targetUserId, status: 'pending' },
      { $set: { status: 'revoked', revoked_at: new Date() } },
      { session },
    );
    await UserInvitation.create([{
      target_user_id: data.targetUserId,
      invited_by: data.actorId,
      kind: data.kind,
      role: data.role,
      enterprise_id: data.enterpriseId,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt,
      status: 'pending',
      delivery_status: 'pending',
      delivery_attempts: 0,
    }], { session });
  }

  async findPendingByHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    return UserInvitation.findOne({ token_hash: tokenHash, status: 'pending', expires_at: { $gt: new Date() } })
      .select('+token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
  }

  async findLatestPending(targetUserId: Types.ObjectId): Promise<Record<string, unknown> | null> {
    return UserInvitation.findOne({ target_user_id: targetUserId, status: 'pending' })
      .sort({ createdAt: -1 }).lean().exec() as Promise<Record<string, unknown> | null>;
  }

  async accept(invitationId: Types.ObjectId, userId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const result = await UserInvitation.updateOne(
      { _id: invitationId, target_user_id: userId, status: 'pending', expires_at: { $gt: new Date() } },
      { $set: { status: 'accepted', accepted_at: new Date() } },
      { session },
    ).exec();
    return result.modifiedCount === 1;
  }

  async markDelivery(tokenHash: string, sent: boolean): Promise<void> {
    await UserInvitation.updateOne({ token_hash: tokenHash, status: 'pending' }, {
      $set: { delivery_status: sent ? 'sent' : 'failed' }, $inc: { delivery_attempts: 1 },
    }).exec();
  }
}

export const userInvitationsRepository = new UserInvitationsRepository();
