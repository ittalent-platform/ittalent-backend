import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';

import { env } from '../../config/env.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { sendUserInvitationEmail } from '../../shared/services/email.service.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { authRepository, type AuthRepository } from '../auth/auth.repository.js';
import { enterprisesService, type EnterprisesService } from '../enterprises/enterprises.service.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import type { CreateAdminUserBody } from '../users/users.schemas.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { USER_INVITATION_MESSAGES, USER_INVITATION_TTL_MS } from './user-invitations.constants.js';
import { userInvitationsRepository, type UserInvitationsRepository } from './user-invitations.repository.js';
import type { AcceptNewAccountInvitationBody } from './user-invitations.schemas.js';

export type AdminCreateUserInput = CreateAdminUserBody;
export interface CreatedManagedUser { user: Record<string, unknown>; invitation: { expiresAt: string; deliveryStatus: 'sent' | 'failed' } }

export class UserInvitationsService {
  constructor(
    private readonly users: UsersService = usersService,
    private readonly invitations: UserInvitationsRepository = userInvitationsRepository,
    private readonly audits: UserAuditsService = userAuditsService,
    private readonly auth: AuthRepository = authRepository,
    private readonly enterprises: EnterprisesService = enterprisesService,
  ) {}

  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  private invitationUrl(token: string): string {
    return `${env.APP_BASE_URL.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(token)}`;
  }

  async createAccount(actorId: string, input: AdminCreateUserInput): Promise<CreatedManagedUser> {
    const enterpriseId = input.role === 'recruiter' ? new Types.ObjectId(input.enterpriseId) : null;
    if (enterpriseId && !(await this.enterprises.isActiveEnterprise(String(enterpriseId)))) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE);
    }
    const actor = await this.users.findById(actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
    }
    const session = await mongoose.startSession();
    const token = randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + USER_INVITATION_TTL_MS);
    let created: Awaited<ReturnType<UsersService['createManagedUser']>> | undefined;
    try {
      await session.withTransaction(async () => {
        const currentActor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!currentActor || currentActor.role !== 'admin' || currentActor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (await this.users.existsByEmailOrUsername(input.email, input.username, session)) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.ACCOUNT_CONFLICT);
        }
        created = await this.users.createManagedUser({ ...input, enterprise_id: enterpriseId }, session);
        await this.auth.createLocalAccount({ userId: created._id, provider: 'local' }, session);
        await this.invitations.create({
          targetUserId: created._id, actorId: new Types.ObjectId(actorId), kind: 'new_account', role: input.role,
          enterpriseId, tokenHash, expiresAt,
        }, session);
        await this.audits.record({ targetUserId: created._id, actorId: new Types.ObjectId(actorId), action: 'account_invited', version: 0, changes: { role: input.role, enterpriseId: enterpriseId ? String(enterpriseId) : null } }, session);
      });
    } finally {
      await session.endSession();
    }
    if (!created) throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, 'Unable to create account');
    let sent = false;
    try { sent = await sendUserInvitationEmail(created.email, this.invitationUrl(token), input.role); } catch { sent = false; }
    await this.invitations.markDelivery(tokenHash, sent);
    return {
      user: {
        id: String(created._id), email: created.email, username: created.username,
        fullName: created.full_name ?? null, phone: created.phone ?? null,
        role: created.role, status: created.status, emailVerified: false,
        enterpriseId: enterpriseId ? String(enterpriseId) : null,
        createdAt: created.createdAt?.toISOString(), updatedAt: created.updatedAt?.toISOString(), version: created.version ?? 0,
      },
      invitation: { expiresAt: expiresAt.toISOString(), deliveryStatus: sent ? 'sent' : 'failed' },
    };
  }

  async inviteExistingUser(actorId: string, targetId: string, enterpriseIdInput: string): Promise<{ deliveryStatus: 'sent' | 'failed'; expiresAt: string }> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
    if (!(await this.enterprises.isActiveEnterprise(enterpriseIdInput))) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE);
    const target = await this.users.findById(targetId);
    if (!target) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'User not found');
    if (target.role !== 'user' || target.status !== 'active' || target.email_verified !== true || target.enterprise_id) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    }
    const token = randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + USER_INVITATION_TTL_MS);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const currentActor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        const latest = await this.users.findByIdWithSession(target._id, session);
        if (!currentActor || currentActor.role !== 'admin' || currentActor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (!latest || latest.version !== target.version || latest.role !== 'user' || latest.status !== 'active' || latest.email_verified !== true || latest.enterprise_id) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.users.serializeIdentityRequests(target._id, session);
        await this.invitations.create({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), kind: 'enterprise_membership', role: 'recruiter', enterpriseId: new Types.ObjectId(enterpriseIdInput), tokenHash, expiresAt }, session);
        await this.audits.record({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), action: 'account_invited', version: target.version ?? 0, changes: { role: 'recruiter', enterpriseId: enterpriseIdInput } }, session);
      });
    } finally { await session.endSession(); }
    let sent = false;
    try { sent = await sendUserInvitationEmail(target.email, this.invitationUrl(token), 'recruiter'); } catch { sent = false; }
    await this.invitations.markDelivery(tokenHash, sent);
    return { deliveryStatus: sent ? 'sent' : 'failed', expiresAt: expiresAt.toISOString() };
  }

  async acceptNewAccount(input: AcceptNewAccountInvitationBody): Promise<{ id: string; email: string; role: string; status: string }> {
    const tokenHash = this.hashToken(input.token);
    const invitation = await this.invitations.findPendingByHash(tokenHash);
    if (!invitation || invitation.kind !== 'new_account') throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    const passwordHash = await bcrypt.hash(input.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    const userId = invitation.target_user_id as Types.ObjectId;
    if (invitation.enterprise_id && !(await this.enterprises.isActiveEnterprise(String(invitation.enterprise_id)))) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE);
    }
    const session = await mongoose.startSession();
    let accepted: Awaited<ReturnType<UsersService['findById']>> = null;
    try {
      await session.withTransaction(async () => {
        const consumed = await this.invitations.accept(invitation._id as Types.ObjectId, userId, session);
        if (!consumed) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
        const target = await this.users.findByIdWithSession(userId, session);
        if (!target) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        accepted = await this.users.updateNewAccountFromInvitation(userId, invitation.role as 'user' | 'recruiter', (invitation.enterprise_id as Types.ObjectId | null) ?? null, target.version ?? 0, session);
        if (!accepted) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.auth.updateLocalAccountPassword(userId, passwordHash, session);
        await this.audits.record({ targetUserId: userId, actorId: invitation.invited_by as Types.ObjectId, action: 'invitation_accepted', version: accepted.version ?? 0 }, session);
      });
    } finally { await session.endSession(); }
    if (!accepted) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    return { id: String(accepted._id), email: accepted.email, role: accepted.role, status: accepted.status };
  }

  async acceptExistingUser(actorId: string, token: string): Promise<{ id: string; role: string; enterpriseId: string | null }> {
    const tokenHash = this.hashToken(token);
    const invitation = await this.invitations.findPendingByHash(tokenHash);
    if (!invitation || invitation.kind !== 'enterprise_membership') throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    const targetId = invitation.target_user_id as Types.ObjectId;
    if (String(targetId) !== actorId || !(await this.enterprises.isActiveEnterprise(String(invitation.enterprise_id)))) throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    const session = await mongoose.startSession();
    let updated: Awaited<ReturnType<UsersService['findById']>> = null;
    try {
      await session.withTransaction(async () => {
        if (!(await this.invitations.accept(invitation._id as Types.ObjectId, targetId, session))) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
        const target = await this.users.findByIdWithSession(targetId, session);
        if (!target) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        updated = await this.users.promoteVerifiedUserFromInvitation(targetId, invitation.enterprise_id as Types.ObjectId, target.version ?? 0, session);
        if (updated && (target.role !== 'user' || target.status !== 'active' || target.email_verified !== true || target.enterprise_id)) updated = null;
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.audits.record({ targetUserId: targetId, actorId: invitation.invited_by as Types.ObjectId, action: 'invitation_accepted', version: updated.version ?? 0, changes: { role: 'recruiter', enterpriseId: String(invitation.enterprise_id) } }, session);
      });
    } finally { await session.endSession(); }
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    return { id: String(updated._id), role: updated.role, enterpriseId: updated.enterprise_id ? String(updated.enterprise_id) : null };
  }

  async resendInvitation(actorId: string, targetId: string): Promise<{ deliveryStatus: 'sent' | 'failed'; expiresAt: string }> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
    const target = await this.users.findById(targetId);
    if (!target || target.status !== 'invited') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    const prior = await this.invitations.findLatestPending(target._id);
    if (!prior) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    if (prior.enterprise_id && !(await this.enterprises.isActiveEnterprise(String(prior.enterprise_id)))) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE);
    const token = randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + USER_INVITATION_TTL_MS);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const currentActor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        const currentTarget = await this.users.findByIdWithSession(target._id, session);
        if (!currentActor || currentActor.role !== 'admin' || currentActor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (!currentTarget || currentTarget.status !== 'invited' || currentTarget.version !== target.version) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.users.serializeIdentityRequests(target._id, session);
        await this.invitations.create({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), kind: prior.kind as 'new_account' | 'enterprise_membership', role: prior.role as 'user' | 'recruiter', enterpriseId: (prior.enterprise_id as Types.ObjectId | null) ?? null, tokenHash, expiresAt }, session);
        await this.audits.record({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), action: 'account_invited', version: target.version ?? 0, changes: { invitationResent: 'true' } }, session);
      });
    } finally { await session.endSession(); }
    let sent = false;
    try { sent = await sendUserInvitationEmail(target.email, this.invitationUrl(token), prior.role as string); } catch { sent = false; }
    await this.invitations.markDelivery(tokenHash, sent);
    return { deliveryStatus: sent ? 'sent' : 'failed', expiresAt: expiresAt.toISOString() };
  }
}

export const userInvitationsService = new UserInvitationsService();
