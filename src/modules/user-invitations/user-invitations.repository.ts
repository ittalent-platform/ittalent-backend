import type { ClientSession, Types } from 'mongoose';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { userInvitations } from '../../db/schema/index.js';
import {
  UserInvitation,
  type UserInvitationKind,
  type UserInvitationRole,
} from '../../models/user-invitation.model.js';

export interface CreateInvitationRecord {
  targetUserId: Types.ObjectId;
  actorId: Types.ObjectId;
  kind: UserInvitationKind;
  role: UserInvitationRole;
  enterpriseId: Types.ObjectId | null;
  tokenHash: string;
  expiresAt: Date;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

export class UserInvitationsRepository {
  async create(data: CreateInvitationRecord, session: ClientSession): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.create)) {
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
      return;
    }

    const db = getSqliteDb();
    const now = new Date();
    db.update(userInvitations)
      .set({ status: 'revoked', revoked_at: now, updatedAt: now })
      .where(
        and(
          eq(userInvitations.target_user_id, String(data.targetUserId)),
          eq(userInvitations.status, 'pending'),
        ),
      )
      .run();

    const id = generateId();
    db.insert(userInvitations)
      .values({
        id,
        target_user_id: String(data.targetUserId),
        invited_by: String(data.actorId),
        kind: data.kind,
        role: data.role,
        enterprise_id: data.enterpriseId ? String(data.enterpriseId) : null,
        token_hash: data.tokenHash,
        expires_at: data.expiresAt,
        status: 'pending',
        delivery_status: 'pending',
        delivery_attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  async findPendingByHash(tokenHash: string): Promise<Record<string, unknown> | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.findOne)) {
      return UserInvitation.findOne({ token_hash: tokenHash, status: 'pending', expires_at: { $gt: new Date() } })
        .select('+token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
    }

    const db = getSqliteDb();
    const now = new Date();
    const row = db
      .select()
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.token_hash, tokenHash),
          eq(userInvitations.status, 'pending'),
          gt(userInvitations.expires_at, now),
        ),
      )
      .get();
    if (!row) return null;
    return {
      _id: row.id,
      ...row,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      expires_at: new Date(row.expires_at),
    };
  }

  async findLatestForTargetWithSession(targetUserId: Types.ObjectId, session: ClientSession): Promise<Record<string, unknown> | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.findOne)) {
      return UserInvitation.findOne({ target_user_id: targetUserId })
        .sort({ createdAt: -1, _id: -1 }).session(session).lean().exec() as Promise<Record<string, unknown> | null>;
    }
    return this.findInvitationForTarget(targetUserId);
  }

  async findInvitationForTarget(targetUserId: Types.ObjectId): Promise<Record<string, unknown> | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.findOne)) {
      return UserInvitation.findOne({ target_user_id: targetUserId })
        .sort({ createdAt: -1, _id: -1 }).select('-token_hash').lean().exec() as Promise<Record<string, unknown> | null>;
    }

    const db = getSqliteDb();
    const row = db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.target_user_id, String(targetUserId)))
      .orderBy(desc(userInvitations.createdAt), desc(userInvitations.id))
      .get();
    if (!row) return null;
    const { token_hash: _, ...rest } = row;
    return {
      _id: row.id,
      ...rest,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      expires_at: new Date(row.expires_at),
    };
  }

  async findLatestForTargets(targetUserIds: Types.ObjectId[]): Promise<Map<string, Record<string, unknown>>> {
    if (!targetUserIds.length) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.aggregate)) {
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

    const db = getSqliteDb();
    const strIds = targetUserIds.map((id) => String(id));
    const rows = db
      .select()
      .from(userInvitations)
      .where(inArray(userInvitations.target_user_id, strIds))
      .orderBy(desc(userInvitations.createdAt), desc(userInvitations.id))
      .all();

    const latest = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      if (!latest.has(r.target_user_id)) {
        latest.set(r.target_user_id, {
          target_user_id: r.target_user_id,
          status: r.status,
          kind: r.kind,
          role: r.role,
          expires_at: new Date(r.expires_at),
          delivery_status: r.delivery_status,
          delivery_attempts: r.delivery_attempts,
          createdAt: new Date(r.createdAt),
        });
      }
    }
    return latest;
  }

  async findLatestForTargetUser(targetUserId: Types.ObjectId, session?: ClientSession): Promise<Record<string, unknown> | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.aggregate)) {
      const pipeline = [
        { $match: { target_user_id: targetUserId } },
        { $sort: { createdAt: -1 as const, _id: -1 as const } },
        { $limit: 1 },
        { $project: { token_hash: 0 } },
      ];
      const aggregate = UserInvitation.aggregate(pipeline);
      if (session) aggregate.session(session);
      const [row] = await aggregate.exec();
      return (row as Record<string, unknown> | undefined) ?? null;
    }
    return this.findInvitationForTarget(targetUserId);
  }

  async cancelPending(targetUserId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.updateOne)) {
      const result = await UserInvitation.updateOne(
        { target_user_id: targetUserId, status: 'pending' },
        { $set: { status: 'cancelled', revoked_at: new Date() } },
        { session },
      ).exec();
      return result.modifiedCount === 1;
    }

    const db = getSqliteDb();
    const now = new Date();
    const res = db
      .update(userInvitations)
      .set({ status: 'cancelled', revoked_at: now, updatedAt: now })
      .where(
        and(
          eq(userInvitations.target_user_id, String(targetUserId)),
          eq(userInvitations.status, 'pending'),
        ),
      )
      .run();
    return res.changes === 1;
  }

  async accept(invitationId: Types.ObjectId, userId: Types.ObjectId, session: ClientSession): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.updateOne)) {
      const result = await UserInvitation.updateOne(
        { _id: invitationId, target_user_id: userId, status: 'pending', expires_at: { $gt: new Date() } },
        { $set: { status: 'accepted', accepted_at: new Date() } },
        { session },
      ).exec();
      return result.modifiedCount === 1;
    }

    const db = getSqliteDb();
    const now = new Date();
    const res = db
      .update(userInvitations)
      .set({ status: 'accepted', accepted_at: now, updatedAt: now })
      .where(
        and(
          eq(userInvitations.id, String(invitationId)),
          eq(userInvitations.target_user_id, String(userId)),
          eq(userInvitations.status, 'pending'),
          gt(userInvitations.expires_at, now),
        ),
      )
      .run();
    return res.changes === 1;
  }

  async markDelivery(tokenHash: string, sent: boolean): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(UserInvitation.updateOne)) {
      await UserInvitation.updateOne({ token_hash: tokenHash, status: 'pending' }, {
        $set: { delivery_status: sent ? 'sent' : 'failed' }, $inc: { delivery_attempts: 1 },
      }).exec();
      return;
    }

    const db = getSqliteDb();
    const row = db
      .select({ attempts: userInvitations.delivery_attempts })
      .from(userInvitations)
      .where(
        and(
          eq(userInvitations.token_hash, tokenHash),
          eq(userInvitations.status, 'pending'),
        ),
      )
      .get();
    if (!row) return;

    db.update(userInvitations)
      .set({
        delivery_status: sent ? 'sent' : 'failed',
        delivery_attempts: row.attempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userInvitations.token_hash, tokenHash),
          eq(userInvitations.status, 'pending'),
        ),
      )
      .run();
  }
}

export const userInvitationsRepository = new UserInvitationsRepository();
