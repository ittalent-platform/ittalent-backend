import { createHash, randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';

import { env } from '../../config/env.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { sendUserEmailChangeEmail } from '../../shared/services/email.service.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { authRepository, type AuthRepository } from '../auth/auth.repository.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { USER_EMAIL_CHANGE_MESSAGES, USER_EMAIL_CHANGE_TTL_MS } from './user-email-changes.constants.js';
import { userEmailChangesRepository, type UserEmailChangesRepository } from './user-email-changes.repository.js';
import type { ConfirmUserEmailChangeBody } from './user-email-changes.schemas.js';

export class UserEmailChangesService {
  constructor(
    private readonly users: UsersService = usersService,
    private readonly changes: UserEmailChangesRepository = userEmailChangesRepository,
    private readonly auth: AuthRepository = authRepository,
    private readonly audits: UserAuditsService = userAuditsService,
  ) {}

  private hashToken(rawToken: string): string { return createHash('sha256').update(rawToken).digest('hex'); }

  async request(actorId: string, targetId: string, newEmail: string, expectedVersion: number): Promise<{ deliveryStatus: 'sent' | 'failed'; expiresAt: string }> {
    const target = await this.users.findById(targetId);
    if (!target) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'User not found');
    if (target.status !== 'active' || target.email_verified !== true) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_EMAIL_CHANGE_MESSAGES.INVALID_REQUEST);
    if (target.version !== expectedVersion) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'The account changed. Reload and try again.');
    if (target.email === newEmail) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'New email must differ from the current email');
    if (await this.users.emailExists(newEmail, target._id)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_EMAIL_CHANGE_MESSAGES.EMAIL_CONFLICT);

    const rawToken = randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + USER_EMAIL_CHANGE_TTL_MS);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await this.users.serializeIdentityRequests(target._id, session);
        const current = await this.users.findByIdWithSession(target._id, session);
        const currentActor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!currentActor || currentActor.role !== 'admin' || currentActor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (!current || current.version !== expectedVersion || current.email !== target.email) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'The account changed. Reload and try again.');
        await this.changes.create({
          targetUserId: target._id,
          actorId: new Types.ObjectId(actorId),
          currentEmail: target.email,
          newEmail,
          tokenHash: this.hashToken(rawToken),
          expiresAt,
          expectedVersion,
        }, session);
        await this.audits.record({
          targetUserId: target._id,
          actorId: new Types.ObjectId(actorId),
          action: 'email_change_requested',
          version: target.version ?? 0,
          changes: { currentEmail: this.maskEmail(target.email), requestedEmail: this.maskEmail(newEmail) },
        }, session);
      });
    } finally { await session.endSession(); }

    let sent = false;
    const url = `${env.APP_BASE_URL.replace(/\/$/, '')}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;
    try { sent = await sendUserEmailChangeEmail(newEmail, url); } catch { sent = false; }
    return { deliveryStatus: sent ? 'sent' : 'failed', expiresAt: expiresAt.toISOString() };
  }

  async confirm(actorId: string, input: ConfirmUserEmailChangeBody): Promise<{ email: string; authVersion: number }> {
    const invitation = await this.changes.findPendingByHash(this.hashToken(input.token));
    if (!invitation) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_EMAIL_CHANGE_MESSAGES.INVALID_REQUEST);
    const userId = invitation.target_user_id as Types.ObjectId;
    if (String(userId) !== actorId) throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_EMAIL_CHANGE_MESSAGES.CURRENT_PASSWORD);
    if (!(await this.auth.verifyCurrentPassword(userId, input.currentPassword))) throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_EMAIL_CHANGE_MESSAGES.CURRENT_PASSWORD);

    const session = await mongoose.startSession();
    let email = '';
    let authVersion = 0;
    try {
      await session.withTransaction(async () => {
        const target = await this.users.findByIdWithSession(userId, session);
        if (!target || target.email !== invitation.current_email || (target.version ?? 0) !== (invitation.expected_version as number)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'The account changed. Reload and try again.');
        if (!(await this.auth.verifyCurrentPassword(userId, input.currentPassword, session))) throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_EMAIL_CHANGE_MESSAGES.CURRENT_PASSWORD);
        if (await this.users.emailExists(String(invitation.new_email), userId)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_EMAIL_CHANGE_MESSAGES.EMAIL_CONFLICT);
        if (!(await this.changes.complete(invitation._id as Types.ObjectId, userId, session))) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_EMAIL_CHANGE_MESSAGES.INVALID_REQUEST);
        const changed = await this.users.updateEmailVersioned(userId, target.version ?? 0, String(invitation.new_email), session);
        if (!changed) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'The account changed. Reload and try again.');
        await this.auth.revokeIdentityTokens(userId, session);
        await this.audits.record({
          targetUserId: userId,
          actorId: invitation.requested_by as Types.ObjectId,
          action: 'email_changed',
          version: changed.version ?? 0,
          changes: { oldEmail: this.maskEmail(String(invitation.current_email)), newEmail: this.maskEmail(changed.email) },
        }, session);
        email = changed.email;
        authVersion = changed.auth_version ?? 0;
      });
    } finally { await session.endSession(); }
    return { email, authVersion };
  }

  private maskEmail(email: string): string {
    const [name = '', domain = ''] = email.split('@');
    return `${name.slice(0, 1)}***@${domain}`;
  }
}

export const userEmailChangesService = new UserEmailChangesService();
