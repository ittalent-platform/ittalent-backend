import { describe, expect, it, vi } from 'vitest';
import { MyProfileService } from '../../../src/modules/my-profile/my-profile.service.js';
import type { MyProfileRepository } from '../../../src/modules/my-profile/my-profile.repository.js';
import type { StorageService } from '../../../src/shared/services/storage.service.js';
import { authService } from '../../../src/modules/auth/auth.service.js';
import { usersService } from '../../../src/modules/users/users.service.js';

const user = { _id: '507f1f77bcf86cd799439011', avatar_url: null };
const dto = { id: String(user._id), email: 'mine@example.test', username: 'mine', fullName: 'My Name', phone: null, role: 'user', status: 'active', emailVerified: true, enterpriseId: null };

describe('MyProfileService', () => {
  it('projects only public profile fields', async () => {
    const repository = { findById: vi.fn().mockResolvedValue({ ...user, password_hash: 'secret' }) } as unknown as MyProfileRepository;
    vi.spyOn(authService, 'hasLocalPassword').mockResolvedValue(true);
    vi.spyOn(usersService, 'mapUserDto').mockReturnValue(dto);
    const service = new MyProfileService(repository, {} as StorageService);
    const result = await service.get(user._id);
    expect(result).toMatchObject({ id: user._id, avatarUrl: null, hasPassword: true });
    expect(JSON.stringify(result)).not.toContain('secret');
    vi.restoreAllMocks();
  });

  it('deletes a newly uploaded image if saving its URL fails', async () => {
    const repository = { findById: vi.fn().mockResolvedValue(user), replaceAvatar: vi.fn().mockRejectedValue(new Error('db unavailable')) } as unknown as MyProfileRepository;
    const storage = { uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey: 'italent/avatars/new' }), deleteFile: vi.fn().mockResolvedValue(true) } as unknown as StorageService;
    const service = new MyProfileService(repository, storage);
    await expect(service.replaceAvatar(user._id, { buffer: Buffer.from('png'), originalname: 'new.png', mimetype: 'image/png' } as Express.Multer.File)).rejects.toThrow('db unavailable');
    expect(storage.deleteFile).toHaveBeenCalledWith('italent/avatars/new', 'image');
  });

  it('deletes the previous avatar after the new one is persisted', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ ...user, avatar_url: 'https://example.test/new.png' }),
      replaceAvatar: vi.fn().mockResolvedValue('italent/avatars/old'),
    } as unknown as MyProfileRepository;
    const storage = {
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey: 'italent/avatars/new' }),
      deleteFile: vi.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    vi.spyOn(authService, 'hasLocalPassword').mockResolvedValue(true);
    vi.spyOn(usersService, 'mapUserDto').mockReturnValue(dto);
    const service = new MyProfileService(repository, storage);
    await service.replaceAvatar(user._id, { buffer: Buffer.from('png'), originalname: 'new.png', mimetype: 'image/png' } as Express.Multer.File);
    expect(repository.replaceAvatar).toHaveBeenCalledWith(user._id, 'https://example.test/new.png', 'italent/avatars/new');
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith('italent/avatars/old', 'image');
    vi.restoreAllMocks();
  });
});
