import type { Express } from 'express';
import { Types, type ClientSession } from 'mongoose';

import { env } from '../../config/env.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { storageService, type StorageService } from '../../shared/services/storage.service.js';
import { authService, type AuthService } from '../auth/auth.service.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { AVATAR_PREFIX, PROFILE_ERROR_CODES, PROFILE_MESSAGES } from './my-profile.constants.js';
import { myProfileRepository, type MyProfileRepository } from './my-profile.repository.js';
import {
  basicMyProfileSchema,
  fullMyProfileSchema,
  type MyProfile,
  type UpdateMyProfile,
} from './my-profile.schemas.js';

interface ProfileTransactionResult {
  user: UserDoc;
  changed: boolean;
}

interface AvatarTransactionResult {
  user: UserDoc;
  previousKey: string | null;
}

export class MyProfileService {
  constructor(
    private readonly repository: MyProfileRepository = myProfileRepository,
    private readonly storage: StorageService = storageService,
    private readonly auth: AuthService = authService,
    private readonly users: UsersService = usersService,
    private readonly audits: UserAuditsService = userAuditsService,
    private readonly enterpriseNameLookup: (enterpriseId: string) => Promise<string | null> = async (enterpriseId) => {
      const { enterprisesService } = await import('../enterprises/enterprises.service.js');
      return enterprisesService.getActiveEnterpriseName(enterpriseId);
    },
  ) {}

  private currentVersion(user: UserDoc): number {
    return user.version ?? (user as { __v?: number }).__v ?? 0;
  }

  private stateError(user: UserDoc): ReturnType<typeof createHttpError> {
    if (user.email_verified !== true) {
      return createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, PROFILE_MESSAGES.EMAIL_NOT_VERIFIED, PROFILE_ERROR_CODES.EMAIL_NOT_VERIFIED);
    }
    const code = user.status === 'suspended'
      ? PROFILE_ERROR_CODES.ACCOUNT_SUSPENDED
      : user.status === 'blocked'
        ? PROFILE_ERROR_CODES.ACCOUNT_BLOCKED
        : PROFILE_ERROR_CODES.ACCOUNT_INACTIVE;
    return createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, PROFILE_MESSAGES.ACCOUNT_INACTIVE, code);
  }

  private assertVerifiedActive(user: UserDoc): void {
    if (user.status !== 'active' || user.email_verified !== true) throw this.stateError(user);
  }

  private isCandidateBasicReadAllowed(user: UserDoc): boolean {
    const windowStart = user.verification_started_at ?? user.createdAt;
    return user.role === 'user'
      && user.email_verified !== true
      && (user.status === 'inactive' || user.status === 'active')
      && windowStart !== undefined
      && Date.now() - new Date(windowStart).getTime() <= env.EMAIL_VERIFICATION_WINDOW_MS;
  }

  private toBasicProfile(user: UserDoc): MyProfile {
    const dto = this.users.mapUserDto(user);
    return basicMyProfileSchema.parse({
      access: 'basic',
      id: dto.id,
      email: dto.email,
      username: dto.username,
      fullName: dto.fullName,
      avatarUrl: dto.avatarUrl ?? null,
      role: dto.role,
      status: dto.status,
      emailVerified: dto.emailVerified,
    });
  }

  private async toFullProfile(user: UserDoc): Promise<MyProfile> {
    const dto = this.users.mapUserDto(user);
    const enterpriseId = dto.enterpriseId;
    const [hasPassword, enterpriseName] = await Promise.all([
      this.auth.hasLocalPassword(String(user._id)),
      enterpriseId ? this.enterpriseNameLookup(enterpriseId) : Promise.resolve(null),
    ]);
    const validEnterpriseId = enterpriseName ? enterpriseId : null;
    return fullMyProfileSchema.parse({
      ...dto,
      access: 'full',
      avatarUrl: dto.avatarUrl ?? null,
      hasPassword,
      enterpriseId: validEnterpriseId,
      enterpriseName,
    });
  }

  async get(userId: string): Promise<MyProfile> {
    const user = await this.repository.findById(userId);
    if (!user) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    if (user.status === 'active' && user.email_verified === true) return this.toFullProfile(user);
    if (this.isCandidateBasicReadAllowed(user)) return this.toBasicProfile(user);
    throw this.stateError(user);
  }

  async update(userId: string, patch: UpdateMyProfile): Promise<MyProfile> {
    const transactionResult = await this.repository.withTransaction<ProfileTransactionResult>(async (session) => {
      const existing = await this.repository.findById(userId, session);
      if (!existing) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
      this.assertVerifiedActive(existing);
      if (this.currentVersion(existing) !== patch.expectedVersion) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PROFILE_MESSAGES.VERSION_CONFLICT, PROFILE_ERROR_CODES.VERSION_CONFLICT);
      }

      const changedFields: string[] = [];
      if (patch.fullName !== undefined && patch.fullName !== (existing.full_name ?? null)) changedFields.push('fullName');
      if (patch.phone !== undefined && patch.phone !== (existing.phone ?? null)) changedFields.push('phone');
      if (!changedFields.length) return { user: existing, changed: false };

      const updated = await this.repository.updateVersionedActive(userId, patch, session);
      if (!updated) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, PROFILE_MESSAGES.VERSION_CONFLICT, PROFILE_ERROR_CODES.VERSION_CONFLICT);
      }
      await this.audits.record({
        targetUserId: new Types.ObjectId(userId),
        actorId: new Types.ObjectId(userId),
        action: 'profile_updated',
        changes: Object.fromEntries(changedFields.map((field) => [field, 'updated'])),
        version: this.currentVersion(updated),
      }, session);
      return { user: updated, changed: true };
    });

    return this.toFullProfile(transactionResult.user);
  }

  async replaceAvatar(userId: string, file: Express.Multer.File): Promise<MyProfile> {
    const user = await this.repository.findById(userId);
    if (!user) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
    this.assertVerifiedActive(user);

    const extension = file.mimetype === 'image/jpeg' ? 'jpeg' : file.mimetype.split('/')[1] ?? 'bin';
    const expectedKey = this.storage.createOwnedKey(
      env.AVATAR_STORAGE_NAMESPACE,
      userId,
      AVATAR_PREFIX,
      extension,
      'image',
    );
    const uploaded = await this.storage.uploadFile({
      buffer: file.buffer,
      fileName: file.originalname,
      prefix: AVATAR_PREFIX,
      resourceType: 'image',
      mimeType: file.mimetype,
      resourceLabel: 'Avatar',
      storageKey: expectedKey,
    });

    if (
      uploaded.storageKey !== expectedKey
      || !this.storage.ownsKey(uploaded.storageKey, env.AVATAR_STORAGE_NAMESPACE, userId, AVATAR_PREFIX)
    ) {
      if (this.storage.ownsKey(uploaded.storageKey, env.AVATAR_STORAGE_NAMESPACE, userId, AVATAR_PREFIX)) {
        await this.storage.deleteFile(uploaded.storageKey, 'image');
      }
      throw createHttpError(
        HTTP_STATUS.HTTP_502_BAD_GATEWAY,
        PROFILE_MESSAGES.STORAGE_OWNERSHIP_MISMATCH,
        PROFILE_ERROR_CODES.STORAGE_OWNERSHIP_MISMATCH,
      );
    }

    let transactionResult: AvatarTransactionResult;
    try {
      transactionResult = await this.repository.withTransaction<AvatarTransactionResult>(async (session: ClientSession) => {
        const current = await this.repository.findByIdForAvatar(userId, session);
        if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, PROFILE_MESSAGES.NOT_FOUND);
        this.assertVerifiedActive(current);
        const previousKey = current.avatar_storage_key ?? null;
        const updated = await this.repository.replaceAvatarActive(userId, uploaded.fileUrl, uploaded.storageKey, session);
        if (!updated) throw this.stateError(current);
        await this.audits.record({
          targetUserId: new Types.ObjectId(userId),
          actorId: new Types.ObjectId(userId),
          action: 'avatar_updated',
          changes: { avatar: 'updated' },
          version: this.currentVersion(updated),
        }, session);
        return { user: updated, previousKey };
      });
    } catch (error) {
      try {
        await this.storage.deleteFile(uploaded.storageKey, 'image');
      } catch (cleanupError) {
        console.error('[avatar:cleanup:error]', {
          message: cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup failure',
        });
      }
      throw error;
    }

    if (transactionResult.previousKey && transactionResult.previousKey !== uploaded.storageKey) {
      try {
        await this.storage.deleteFile(transactionResult.previousKey, 'image');
      } catch (cleanupError) {
        console.error('[avatar:displaced-cleanup:error]', {
          message: cleanupError instanceof Error ? cleanupError.message : 'Unknown displaced-avatar cleanup failure',
        });
      }
    }

    return this.toFullProfile(transactionResult.user);
  }
}

export const myProfileService = new MyProfileService();
