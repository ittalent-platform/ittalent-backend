import { User, type UserDoc } from '../../models/user.model.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

export class MyProfileRepository {
  findById(id: string): Promise<UserDoc | null> {
    return User.findById(id).exec();
  }

  update(id: string, patch: UpdateMyProfile): Promise<UserDoc | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};
    if (patch.fullName !== undefined) $set.full_name = patch.fullName;
    if (patch.phone === null) $unset.phone = '';
    else if (patch.phone !== undefined) $set.phone = patch.phone;

    const versionFilter =
      patch.expectedVersion === undefined
        ? {}
        : patch.expectedVersion === 0
          ? { $or: [{ version: 0 }, { version: { $exists: false } }] }
          : { version: patch.expectedVersion };

    return User.findOneAndUpdate(
      { _id: id, ...versionFilter },
      {
        $inc: { version: 1 },
        ...(Object.keys($set).length ? { $set } : {}),
        ...(Object.keys($unset).length ? { $unset } : {}),
      },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  async replaceAvatar(id: string, avatarUrl: string, storageKey: string): Promise<string | null | undefined> {
    // Return the pre-update document so the caller can atomically identify and delete the displaced storage key.
    const previous = await User.findByIdAndUpdate(
      id,
      { $set: { avatar_url: avatarUrl, avatar_storage_key: storageKey } },
      { returnDocument: 'before', runValidators: true, projection: { avatar_storage_key: 1 } },
    ).select('+avatar_storage_key').exec();
    return previous ? previous.avatar_storage_key ?? null : undefined;
  }
}

export const myProfileRepository = new MyProfileRepository();
