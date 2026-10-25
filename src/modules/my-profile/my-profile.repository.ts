import mongoose, { type ClientSession } from 'mongoose';

import { User, type UserDoc } from '../../models/user.model.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

export class MyProfileRepository {
  async withTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
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

  findById(id: string, session?: ClientSession): Promise<UserDoc | null> {
    const query = User.findById(id);
    if (session) query.session(session);
    return query.exec();
  }

  findByIdForAvatar(id: string, session: ClientSession): Promise<UserDoc | null> {
    return User.findById(id).select('+avatar_storage_key').session(session).exec();
  }

  updateVersionedActive(id: string, patch: UpdateMyProfile, session: ClientSession): Promise<UserDoc | null> {
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

  replaceAvatarActive(id: string, avatarUrl: string, storageKey: string, session: ClientSession): Promise<UserDoc | null> {
    return User.findOneAndUpdate(
      { _id: id, status: 'active', email_verified: true },
      { $set: { avatar_url: avatarUrl, avatar_storage_key: storageKey }, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true, session },
    ).select('+avatar_storage_key').exec();
  }
}

export const myProfileRepository = new MyProfileRepository();
