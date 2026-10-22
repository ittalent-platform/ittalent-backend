import { User, type UserDoc } from '../../models/user.model.js';
import { usersRepository } from '../users/users.repository.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

export class MyProfileRepository {
  findById(id: string): Promise<UserDoc | null> {
    return usersRepository.findById(id);
  }

  update(id: string, patch: UpdateMyProfile): Promise<UserDoc | null> {
    return usersRepository.updateProfile(id, patch);
  }

  async replaceAvatar(id: string, avatarUrl: string, storageKey: string): Promise<string | null | undefined> {
    const previous = await User.findByIdAndUpdate(
      id,
      { $set: { avatar_url: avatarUrl, avatar_storage_key: storageKey } },
      { returnDocument: 'before', runValidators: true, projection: { avatar_storage_key: 1 } },
    ).select('+avatar_storage_key').exec();
    return previous ? previous.avatar_storage_key ?? null : undefined;
  }
}

export const myProfileRepository = new MyProfileRepository();
