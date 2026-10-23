import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { MyProfileRepository } from '../../../src/modules/my-profile/my-profile.repository.js';
import { MyProfileService } from '../../../src/modules/my-profile/my-profile.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import type { StorageService } from '../../../src/shared/services/storage.service.js';

const user = { _id: '507f1f77bcf86cd799439011', avatar_url: null };
const dto = {
  id: String(user._id),
  email: 'mine@example.test',
  username: 'mine',
  fullName: 'My Name',
  phone: null,
  role: 'user' as const,
  status: 'active' as const,
  emailVerified: true,
  enterpriseId: null,
};

function createDependencies(): {
  auth: AuthService;
  users: UsersService;
} {
  return {
    auth: { hasLocalPassword: vi.fn().mockResolvedValue(true) } as unknown as AuthService,
    users: { mapUserDto: vi.fn().mockReturnValue(dto) } as unknown as UsersService,
  };
}

describe('MyProfileService', () => {
  it('projects only public profile fields', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ ...user, password_hash: 'secret' }),
    } as unknown as MyProfileRepository;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users);

    const result = await service.get(user._id);

    expect(result).toMatchObject({ id: user._id, avatarUrl: null, hasPassword: true });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('throws 404 when profile is not found on get', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as MyProfileRepository;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users);

    await expect(service.get(user._id)).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
    });
  });

  it('updates profile without re-querying findById', async () => {
    const updatedUser = { ...user, full_name: 'Updated Name', avatar_url: 'https://example.test/avatar.png' };
    const repository = {
      findById: vi.fn(),
      update: vi.fn().mockResolvedValue(updatedUser),
    } as unknown as MyProfileRepository;
    const { auth, users } = createDependencies();
    vi.mocked(users.mapUserDto).mockReturnValue({ ...dto, fullName: 'Updated Name' });
    const service = new MyProfileService(repository, {} as StorageService, auth, users);

    const result = await service.update(user._id, { fullName: 'Updated Name' });

    expect(repository.update).toHaveBeenCalledWith(user._id, { fullName: 'Updated Name' });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: user._id,
      fullName: 'Updated Name',
      avatarUrl: 'https://example.test/avatar.png',
      hasPassword: true,
    });
  });

  it('throws 404 when profile is not found on update', async () => {
    const repository = {
      update: vi.fn().mockResolvedValue(null),
    } as unknown as MyProfileRepository;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users);

    await expect(service.update(user._id, { fullName: 'Updated Name' })).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
    });
  });

  it('throws 404 before uploading avatar when user does not exist', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as MyProfileRepository;
    const storage = {
      uploadFile: vi.fn(),
    } as unknown as StorageService;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users);

    await expect(
      service.replaceAvatar(user._id, {
        buffer: Buffer.from('png'),
        originalname: 'new.png',
        mimetype: 'image/png',
      } as Express.Multer.File),
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
    });
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('deletes a newly uploaded image if saving its URL fails', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(user),
      replaceAvatar: vi.fn().mockRejectedValue(new Error('db unavailable')),
    } as unknown as MyProfileRepository;
    const storage = {
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey: 'italent/avatars/new' }),
      deleteFile: vi.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users);

    await expect(
      service.replaceAvatar(user._id, {
        buffer: Buffer.from('png'),
        originalname: 'new.png',
        mimetype: 'image/png',
      } as Express.Multer.File),
    ).rejects.toThrow('db unavailable');
    expect(storage.deleteFile).toHaveBeenCalledWith('italent/avatars/new', 'image');
  });

  it('deletes the previous avatar after the new one is persisted without re-querying findById', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(user),
      replaceAvatar: vi.fn().mockResolvedValue('italent/avatars/old'),
    } as unknown as MyProfileRepository;
    const storage = {
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey: 'italent/avatars/new' }),
      deleteFile: vi.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    const { auth, users } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users);

    const result = await service.replaceAvatar(user._id, {
      buffer: Buffer.from('png'),
      originalname: 'new.png',
      mimetype: 'image/png',
    } as Express.Multer.File);

    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.replaceAvatar).toHaveBeenCalledWith(user._id, 'https://example.test/new.png', 'italent/avatars/new');
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith('italent/avatars/old', 'image');
    expect(result.avatarUrl).toBe('https://example.test/new.png');
  });
});
