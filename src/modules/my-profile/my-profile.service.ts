import type { Express } from 'express';

import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { storageService, type StorageService } from '../../shared/services/storage.service.js';
import { authService, type AuthService } from '../auth/auth.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { AVATAR_FOLDER, AVATAR_PREFIX, PROFILE_MESSAGES } from './my-profile.constants.js';
import { myProfileRepository, type MyProfileRepository } from './my-profile.repository.js';
import { myProfileSchema, type MyProfile, type UpdateMyProfile } from './my-profile.schemas.js';

export class MyProfileService {
  constructor(
    private readonly repository: MyProfileRepository = myProfileRepository,
    private readonly storage: StorageService = storageService,
    private readonly auth: AuthService = authService,
    private readonly users: UsersService = usersService,
  ) {}

  private async toMyProfile(user: UserDoc, avatarUrl: string | null = user.avatar_url ?? null): Promise<MyProfile> {
    const hasPassword = await this.auth.hasLocalPassword(String(user._id));
    return myProfileSchema.parse({
      ...this.users.mapUserDto(user),
      avatarUrl,
      hasPassword,
    });
  }

  async get(userId: string): Promise<MyProfile> {
    const user = await this.repository.findById(userId);
    if (!user) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    return this.toMyProfile(user);
  }

  async update(userId: string, patch: UpdateMyProfile): Promise<MyProfile> {
    if (patch.expectedVersion !== undefined) {
      const existing = await this.repository.findById(userId);
      if (!existing) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
      const currentVersion = existing.version ?? (existing as { __v?: number }).__v ?? 0;
      if (currentVersion !== patch.expectedVersion) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PROFILE_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
      }
    }

    const user = await this.repository.update(userId, patch);
    if (!user) {
      if (patch.expectedVersion !== undefined) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PROFILE_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
      }
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    }
    return this.toMyProfile(user);
  }

  async replaceAvatar(userId: string, file: Express.Multer.File): Promise<MyProfile> {
    const user = await this.repository.findById(userId);
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    }
    const uploaded = await this.storage.uploadFile({
      buffer: file.buffer,
      fileName: file.originalname,
      folder: AVATAR_FOLDER,
      prefix: AVATAR_PREFIX,
      resourceType: 'image',
      mimeType: file.mimetype,
      resourceLabel: 'Avatar',
    });
    let previousKey: string | null | undefined;
    try {
      previousKey = await this.repository.replaceAvatar(userId, uploaded.fileUrl, uploaded.storageKey);
      if (previousKey === undefined) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    } catch (error) {
      try {
        await this.storage.deleteFile(uploaded.storageKey, 'image');
      } catch (cleanupError) {
        console.error('Failed to clean up uploaded avatar after profile persistence failure', cleanupError);
      }
      throw error;
    }
    if (previousKey && previousKey !== uploaded.storageKey) {
      await this.storage.deleteFile(previousKey, 'image');
    }
    return this.toMyProfile(user, uploaded.fileUrl);
  }
}

export const myProfileService = new MyProfileService();
