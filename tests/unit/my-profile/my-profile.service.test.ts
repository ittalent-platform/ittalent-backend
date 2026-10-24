import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import { PROFILE_MESSAGES } from '../../../src/modules/my-profile/my-profile.constants.js';
import type { MyProfileRepository } from '../../../src/modules/my-profile/my-profile.repository.js';
import { MyProfileService } from '../../../src/modules/my-profile/my-profile.service.js';
import type { StorageReconciliationsService } from '../../../src/modules/storage-reconciliations/storage-reconciliations.service.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import type { StorageService } from '../../../src/shared/services/storage.service.js';

const user = {
  _id: '507f1f77bcf86cd799439011',
  avatar_url: null,
  avatar_storage_key: null,
  full_name: 'My Name',
  phone: undefined,
  role: 'user' as const,
  status: 'active' as const,
  email_verified: true,
  auth_version: 0,
  createdAt: new Date(),
  version: 1,
};
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
  version: 1,
};

function createDependencies(): {
  auth: AuthService;
  users: UsersService;
  audits: UserAuditsService;
  reconciliations: StorageReconciliationsService;
} {
  return {
    auth: { hasLocalPassword: vi.fn().mockResolvedValue(true) } as unknown as AuthService,
    users: { mapUserDto: vi.fn().mockReturnValue(dto) } as unknown as UsersService,
    audits: { record: vi.fn().mockResolvedValue(undefined) } as unknown as UserAuditsService,
    reconciliations: {
      schedule: vi.fn().mockResolvedValue(undefined),
      markCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as StorageReconciliationsService,
  };
}

function transactionalRepository(overrides: Record<string, unknown>): MyProfileRepository {
  return {
    withTransaction: vi.fn(async (operation: (session: never) => Promise<unknown>) => operation({} as never)),
    ...overrides,
  } as unknown as MyProfileRepository;
}

describe('MyProfileService', () => {
  it('projects only public profile fields', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ ...user, password_hash: 'secret' }),
    } as unknown as MyProfileRepository;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    const result = await service.get(user._id);

    expect(result).toMatchObject({ id: user._id, avatarUrl: null, hasPassword: true });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('returns only a valid active enterprise membership name and suppresses stale membership', async () => {
    const enterpriseId = '507f1f77bcf86cd799439099';
    const repository = { findById: vi.fn().mockResolvedValue({ ...user, enterprise_id: enterpriseId }) } as unknown as MyProfileRepository;
    const { auth, users, audits, reconciliations } = createDependencies();
    vi.mocked(users.mapUserDto).mockReturnValue({ ...dto, enterpriseId });

    const activeService = new MyProfileService(
      repository,
      {} as StorageService,
      auth,
      users,
      audits,
      reconciliations,
      vi.fn().mockResolvedValue('Active Enterprise'),
    );
    await expect(activeService.get(user._id)).resolves.toMatchObject({
      enterpriseId,
      enterpriseName: 'Active Enterprise',
    });

    const staleService = new MyProfileService(
      repository,
      {} as StorageService,
      auth,
      users,
      audits,
      reconciliations,
      vi.fn().mockResolvedValue(null),
    );
    await expect(staleService.get(user._id)).resolves.toMatchObject({
      enterpriseId: null,
      enterpriseName: null,
    });
  });

  it('throws 404 when profile is not found on get', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as MyProfileRepository;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    await expect(service.get(user._id)).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
    });
  });

  it('returns an explicit basic projection for an unverified Candidate in the grace window', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({ ...user, status: 'inactive', email_verified: false }),
    } as unknown as MyProfileRepository;
    const { auth, users, audits, reconciliations } = createDependencies();
    vi.mocked(users.mapUserDto).mockReturnValue({ ...dto, status: 'inactive', emailVerified: false });
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    const result = await service.get(user._id);

    expect(result).toMatchObject({ access: 'basic', id: user._id, emailVerified: false });
    expect(result).not.toHaveProperty('phone');
    expect(result).not.toHaveProperty('enterpriseId');
    expect(result).not.toHaveProperty('hasPassword');
  });

  it('updates profile when expectedVersion matches current version', async () => {
    const updatedUser = { ...user, full_name: 'Updated Name', version: 2 };
    const repository = transactionalRepository({
      findById: vi.fn().mockResolvedValue(user),
      updateVersionedActive: vi.fn().mockResolvedValue(updatedUser),
    });
    const { auth, users, audits, reconciliations } = createDependencies();
    vi.mocked(users.mapUserDto).mockReturnValue({ ...dto, fullName: 'Updated Name', version: 2 });
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    const result = await service.update(user._id, { fullName: 'Updated Name', expectedVersion: 1 });

    expect(repository.findById).toHaveBeenCalledWith(user._id, expect.anything());
    expect(repository.updateVersionedActive).toHaveBeenCalledWith(
      user._id,
      { fullName: 'Updated Name', expectedVersion: 1 },
      expect.anything(),
    );
    expect(audits.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'profile_updated',
      changes: { fullName: 'updated' },
      version: 2,
    }), expect.anything());
    expect(result).toMatchObject({
      access: 'full',
      id: user._id,
      fullName: 'Updated Name',
      version: 2,
    });
  });

  it('throws 409 when expectedVersion does not match current version', async () => {
    const repository = transactionalRepository({
      findById: vi.fn().mockResolvedValue({ ...user, version: 3 }),
      updateVersionedActive: vi.fn(),
    });
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    await expect(
      service.update(user._id, { fullName: 'Updated Name', expectedVersion: 1 }),
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_409_CONFLICT,
      message: PROFILE_MESSAGES.VERSION_CONFLICT,
    });
    expect(repository.updateVersionedActive).not.toHaveBeenCalled();
  });

  it('throws 404 when profile is not found on update', async () => {
    const repository = transactionalRepository({ findById: vi.fn().mockResolvedValue(null) });
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    await expect(service.update(user._id, { fullName: 'Updated Name', expectedVersion: 1 })).rejects.toMatchObject({
      statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
    });
  });

  it('does not increment version or audit a normalized no-op and still checks the version', async () => {
    const repository = transactionalRepository({
      findById: vi.fn().mockResolvedValue(user),
      updateVersionedActive: vi.fn(),
    });
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    const result = await service.update(user._id, { fullName: 'My Name', phone: null, expectedVersion: 1 });

    expect(result).toMatchObject({ access: 'full', version: 1 });
    expect(repository.updateVersionedActive).not.toHaveBeenCalled();
    expect(audits.record).not.toHaveBeenCalled();
  });

  it('fails the profile transaction when the sanitized audit write fails', async () => {
    const updatedUser = { ...user, full_name: 'Updated Name', version: 2 };
    const repository = transactionalRepository({
      findById: vi.fn().mockResolvedValue(user),
      updateVersionedActive: vi.fn().mockResolvedValue(updatedUser),
    });
    const { auth, users, audits, reconciliations } = createDependencies();
    vi.mocked(audits.record).mockRejectedValue(new Error('audit unavailable'));
    const service = new MyProfileService(repository, {} as StorageService, auth, users, audits, reconciliations);

    await expect(service.update(user._id, { fullName: 'Updated Name', expectedVersion: 1 }))
      .rejects.toThrow('audit unavailable');
    expect(audits.record).toHaveBeenCalledWith(expect.objectContaining({
      changes: { fullName: 'updated' },
    }), expect.anything());
  });

  it('throws 404 before uploading avatar when user does not exist', async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as MyProfileRepository;
    const storage = {
      uploadFile: vi.fn(),
    } as unknown as StorageService;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users, audits, reconciliations);

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
    const storageKey = `profile-avatars/${user._id}/avatar-new.png`;
    const repository = {
      findById: vi.fn().mockResolvedValue(user),
      withTransaction: vi.fn().mockRejectedValue(new Error('db unavailable')),
    } as unknown as MyProfileRepository;
    const storage = {
      createOwnedKey: vi.fn().mockReturnValue(storageKey),
      ownsKey: vi.fn().mockReturnValue(true),
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey }),
      deleteFile: vi.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users, audits, reconciliations);

    await expect(
      service.replaceAvatar(user._id, {
        buffer: Buffer.from('png'),
        originalname: 'new.png',
        mimetype: 'image/png',
      } as Express.Multer.File),
    ).rejects.toThrow('db unavailable');
    expect(storage.deleteFile).toHaveBeenCalledWith(storageKey, 'image');
  });

  it('never attaches a storage key that does not match the server-owned key', async () => {
    const expectedKey = `profile-avatars/${user._id}/avatar-expected.png`;
    const repository = transactionalRepository({ findById: vi.fn().mockResolvedValue(user) });
    const storage = {
      createOwnedKey: vi.fn().mockReturnValue(expectedKey),
      ownsKey: vi.fn().mockReturnValue(false),
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/foreign.png', storageKey: 'foreign/key.png' }),
      deleteFile: vi.fn(),
    } as unknown as StorageService;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users, audits, reconciliations);

    await expect(service.replaceAvatar(user._id, {
      buffer: Buffer.from('png'), originalname: 'new.png', mimetype: 'image/png',
    } as Express.Multer.File)).rejects.toMatchObject({ code: 'STORAGE_OWNERSHIP_MISMATCH' });
    expect(repository.withTransaction).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('durably schedules orphan cleanup when immediate deletion fails after persistence failure', async () => {
    const storageKey = `profile-avatars/${user._id}/avatar-new.png`;
    const repository = {
      findById: vi.fn().mockResolvedValue(user),
      withTransaction: vi.fn().mockRejectedValue(new Error('audit unavailable')),
    } as unknown as MyProfileRepository;
    const storage = {
      createOwnedKey: vi.fn().mockReturnValue(storageKey),
      ownsKey: vi.fn().mockReturnValue(true),
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey }),
      deleteFile: vi.fn().mockResolvedValue(false),
    } as unknown as StorageService;
    const { auth, users, audits, reconciliations } = createDependencies();
    const service = new MyProfileService(repository, storage, auth, users, audits, reconciliations);

    await expect(service.replaceAvatar(user._id, {
      buffer: Buffer.from('png'), originalname: 'new.png', mimetype: 'image/png',
    } as Express.Multer.File)).rejects.toThrow('audit unavailable');
    expect(reconciliations.schedule).toHaveBeenCalledWith({ storageKey, reason: 'orphaned_upload' });
  });

  it('commits avatar reference and audit before durably cleaning the previous asset', async () => {
    const storageKey = `profile-avatars/${user._id}/avatar-new.png`;
    const previousKey = `profile-avatars/${user._id}/avatar-old.png`;
    const updatedUser = { ...user, avatar_url: 'https://example.test/new.png', avatar_storage_key: storageKey, version: 2 };
    const repository = transactionalRepository({
      findById: vi.fn().mockResolvedValue(user),
      findByIdForAvatar: vi.fn().mockResolvedValue({ ...user, avatar_storage_key: previousKey }),
      replaceAvatarActive: vi.fn().mockResolvedValue(updatedUser),
    });
    const storage = {
      createOwnedKey: vi.fn().mockReturnValue(storageKey),
      ownsKey: vi.fn().mockReturnValue(true),
      uploadFile: vi.fn().mockResolvedValue({ fileUrl: 'https://example.test/new.png', storageKey }),
      deleteFile: vi.fn().mockResolvedValue(true),
    } as unknown as StorageService;
    const { auth, users, audits, reconciliations } = createDependencies();
    vi.mocked(users.mapUserDto).mockReturnValue({ ...dto, avatarUrl: 'https://example.test/new.png', version: 2 });
    const service = new MyProfileService(repository, storage, auth, users, audits, reconciliations);

    const result = await service.replaceAvatar(user._id, {
      buffer: Buffer.from('png'),
      originalname: 'new.png',
      mimetype: 'image/png',
    } as Express.Multer.File);

    expect(repository.findById).toHaveBeenCalledTimes(1);
    expect(repository.replaceAvatarActive).toHaveBeenCalledWith(user._id, 'https://example.test/new.png', storageKey, expect.anything());
    expect(audits.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'avatar_updated', version: 2 }), expect.anything());
    expect(reconciliations.schedule).toHaveBeenCalledWith({ storageKey: previousKey, reason: 'displaced_asset' }, expect.anything());
    expect(storage.deleteFile).toHaveBeenCalledExactlyOnceWith(previousKey, 'image');
    expect(reconciliations.markCompleted).toHaveBeenCalledWith(previousKey);
    expect(result.avatarUrl).toBe('https://example.test/new.png');
  });
});
