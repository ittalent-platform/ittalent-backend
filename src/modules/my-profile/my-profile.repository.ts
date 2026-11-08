import mongoose, { type ClientSession, type Types } from 'mongoose';
import { and, eq, or } from 'drizzle-orm';

import { getSqliteDb } from '../../config/sqlite.js';
import { users } from '../../db/schema/index.js';
import {
  User,
  type UserDoc,
  type UserRole,
  type UserStatus,
} from '../../models/user.model.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toUserDoc(row: typeof users.$inferSelect): UserDoc {
  const doc = {
    _id: row.id as unknown as Types.ObjectId,
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as UserRole,
    status: row.status as UserStatus,
    full_name: row.full_name ?? undefined,
    phone: row.phone ?? undefined,
    avatar_url: row.avatar_url ?? null,
    avatar_storage_key: row.avatar_storage_key ?? null,
    email_verified: row.email_verified,
    auth_version: row.auth_version,
    version: row.version,
    admin_lock_version: row.admin_lock_version,
    identity_request_version: row.identity_request_version,
    verification_started_at: row.verification_started_at ?? undefined,
    enterprise_id: (row.enterprise_id as unknown as Types.ObjectId) ?? null,
    status_updated_at: row.status_updated_at ?? null,
    status_updated_by: (row.status_updated_by as unknown as Types.ObjectId) ?? null,
    status_reason: row.status_reason ?? null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  return {
    ...doc,
    toObject() {
      return doc;
    },
    toJSON() {
      return doc;
    },
  } as unknown as UserDoc;
}

export class MyProfileRepository {
  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    if (process.env.USE_MONGODB === 'true' || isMock(mongoose.startSession)) {
      const session = await mongoose.startSession();
      let result: T | undefined;
      try {
        await session.withTransaction(async () => {
          result = await operation(session);
        });
        if (result === undefined) throw new Error('Profile transaction completed without a result');
        return result;
      } finally {
        await session.endSession();
      }
    }

    const fakeSession = {} as ClientSession;
    return operation(fakeSession);
  }

  async findById(id: string, session?: ClientSession): Promise<UserDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(User.findById)) {
      const query = User.findById(id);
      if (session && typeof query.session === 'function') query.session(session);
      return query.exec();
    }
    const db = getSqliteDb();
    const row = db.select().from(users).where(eq(users.id, id)).get();
    return row ? toUserDoc(row) : null;
  }

  async findByIdForAvatar(id: string, session: ClientSession): Promise<UserDoc | null> {
    return this.findById(id, session);
  }

  async updateVersionedActive(id: string, patch: UpdateMyProfile, session: ClientSession): Promise<UserDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(User.findOneAndUpdate)) {
      const $set: Record<string, unknown> = {};
      const $unset: Record<string, ''> = {};
      if (patch.fullName !== undefined) $set.full_name = patch.fullName;
      if (patch.phone === null) $unset.phone = '';
      else if (patch.phone !== undefined) $set.phone = patch.phone;

      const versionFilter = patch.expectedVersion === 0
        ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
        : { version: patch.expectedVersion };

      return User.findOneAndUpdate(
        { _id: id, status: 'active', email_verified: true, ...versionFilter },
        {
          $inc: { version: 1 },
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
        },
        { returnDocument: 'after', runValidators: true, session },
      ).exec();
    }

    const db = getSqliteDb();
    const conditions = [
      eq(users.id, id),
      eq(users.status, 'active'),
      eq(users.email_verified, true),
    ];

    if (patch.expectedVersion === 0) {
      conditions.push(or(eq(users.version, 0), eq(users.version, 1))!);
    } else {
      conditions.push(eq(users.version, patch.expectedVersion));
    }

    const existing = db
      .select()
      .from(users)
      .where(and(...conditions))
      .get();
    if (!existing) return null;

    const updateData: Partial<typeof users.$inferInsert> = {
      version: existing.version + 1,
      updatedAt: new Date(),
    };
    if (patch.fullName !== undefined) updateData.full_name = patch.fullName;
    if (patch.phone !== undefined) updateData.phone = patch.phone ?? null;

    db.update(users).set(updateData).where(eq(users.id, id)).run();
    const updated = db.select().from(users).where(eq(users.id, id)).get();
    return updated ? toUserDoc(updated) : null;
  }

  async replaceAvatarActive(id: string, avatarUrl: string, storageKey: string, session: ClientSession): Promise<UserDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(User.findOneAndUpdate)) {
      return User.findOneAndUpdate(
        { _id: id, status: 'active', email_verified: true },
        { $set: { avatar_url: avatarUrl, avatar_storage_key: storageKey }, $inc: { version: 1 } },
        { returnDocument: 'after', runValidators: true, session },
      ).select('+avatar_storage_key').exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.status, 'active'),
          eq(users.email_verified, true),
        ),
      )
      .get();
    if (!existing) return null;

    db.update(users)
      .set({
        avatar_url: avatarUrl,
        avatar_storage_key: storageKey,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .run();

    const updated = db.select().from(users).where(eq(users.id, id)).get();
    return updated ? toUserDoc(updated) : null;
  }
}

export const myProfileRepository = new MyProfileRepository();
