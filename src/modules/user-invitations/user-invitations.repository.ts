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

  async findLatestForTargetWithSession(targetUserId: Types.ObjectId, session: ClientSession): Promise<Record<string, unknown> | null> {
    return UserInvitation.findOne({ target_user_id: targetUserId }).sort({ createdAt: -1, _id: -1 }).session(session).lean().exec() as Promise<Record<string, unknown> | null>;
  }

  async findInvitationForTarget(targetUserId: Types.ObjectId): Promise<Record<string, unknown> | null> {
    return UserInvitation.findOne({ target_user_id: targetUserId })
      .sort({ createdAt: -1, _id: -1 }).select('-token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
  }

  async findLatestForTargets(targetUserIds: Types.ObjectId[]): Promise<Map<string, Record<string, unknown>>> {
    if (!targetUserIds.length) return new Map();
    const rows = await UserInvitation.aggregate<Record<string, unknown>>([
      { $match: { target_user_id: { $in: targetUserIds } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$target_user_id', invitation: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$invitation' } },
      { $project: { target_user_id: 1, status: 1, kind: 1, role: 1, expires_at: 1, delivery_status: 1, delivery_attempts: 1, createdAt: 1 } },
    ]).exec();
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const id = String(row.target_user_id);
      if (!latest.has(id)) latest.set(id, row as unknown as Record<string, unknown>);
    }
    return latest;
  }

  async findLatestForTargetUser(targetUserId: Types.ObjectId, session?: ClientSession): Promise<Record<string, unknown> | null> {
    const pipeline = [
      { $match: { target_user_id: targetUserId } },
      { $sort: { createdAt: -1 as const, _id: -1 as const } },
      { $limit: 1 },
      { $project: { token_hash: 0 } },
    ];
    const aggregate = UserInvitation.aggregate(pipeline);
    if (session) aggregate.session(session);
    const [row] = await aggregate.exec();
    return row as Record<string, unknown> | undefined ?? null;
  }

  async cancelPending(targetUserId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    const result = await UserInvitation.updateOne(
      { target_user_id: targetUserId, status: 'pending' },
      { $set: { status: 'cancelled', revoked_at: new Date() } },
      { session },
    ).exec();
    return result.modifiedCount === 1;
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
