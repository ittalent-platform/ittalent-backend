import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { userInvitationRoles, type UserInvitationRole } from '../../models/user-invitation.model.js';

import { env } from '../../config/env.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { sendUserInvitationEmail } from '../../shared/services/email.service.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { authRepository, type AuthRepository } from '../auth/auth.repository.js';
import { enterprisesService, type EnterprisesService } from '../enterprises/enterprises.service.js';
import { enterpriseRegistrationsService, type EnterpriseRegistrationsService } from '../enterprise-registrations/enterprise-registrations.service.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import type { CancelInvitationBody, CreateAdminUserBody } from '../users/users.schemas.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { USER_INVITATION_MESSAGES, USER_INVITATION_TTL_MS } from './user-invitations.constants.js';
import { userInvitationsRepository, type UserInvitationsRepository } from './user-invitations.repository.js';
import type { AcceptNewAccountInvitationBody } from './user-invitations.schemas.js';

export type AdminCreateUserInput = CreateAdminUserBody;
export interface CreatedManagedUser { user: Record<string, unknown>; invitation: { expiresAt: string; deliveryStatus: 'sent' | 'failed' } }
export interface InvitationStatus { status: string; kind: string; role: string; expiresAt: string; sentAt: string | null; deliveryStatus: string; deliveryAttempts: number }

export class UserInvitationsService {
  constructor(
    private readonly users: UsersService = usersService,
    private readonly invitations: UserInvitationsRepository = userInvitationsRepository,
    private readonly audits: UserAuditsService = userAuditsService,
    private readonly auth: AuthRepository = authRepository,
    private readonly enterprises: EnterprisesService = enterprisesService,
    private readonly registrations: EnterpriseRegistrationsService = enterpriseRegistrationsService,
  ) {}

  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }

  private invitationUrl(token: string): string {
    return `${env.APP_BASE_URL.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(token)}`;
  }

  async createAccount(actorId: string, input: AdminCreateUserInput): Promise<CreatedManagedUser> {
    const isCompanyAccount = input.role === 'recruiter' || input.role === 'enterprise_admin';
    if (isCompanyAccount && !input.enterpriseId) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
    }
    if (!isCompanyAccount && input.enterpriseId) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
    const enterpriseId = isCompanyAccount ? new Types.ObjectId(input.enterpriseId) : null;
    if (enterpriseId && !(await this.enterprises.isActiveEnterprise(String(enterpriseId)))) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
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
        if (enterpriseId && !(await this.enterprises.isActiveEnterprise(String(enterpriseId), session))) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
        if (enterpriseId && !await this.users.lockEnterpriseAdminChanges(enterpriseId, session)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
        if (await this.registrations.hasIncompleteOnboarding(input.email, enterpriseId, session)) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.ONBOARDING_PENDING, 'ENTERPRISE_ONBOARDING_PENDING');
        }
        if (await this.users.existsByEmailOrUsername(input.email, input.username, session)) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.ACCOUNT_CONFLICT, 'ACCOUNT_CONFLICT');
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

  async acceptNewAccount(input: AcceptNewAccountInvitationBody): Promise<{ id: string; email: string; role: string; status: string }> {
    const tokenHash = this.hashToken(input.token);
    const invitation = await this.invitations.findPendingByHash(tokenHash);
    if (!invitation || invitation.kind !== 'new_account') throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    const passwordHash = await bcrypt.hash(input.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    const userId = invitation.target_user_id as Types.ObjectId;
    if (invitation.enterprise_id && !(await this.enterprises.isActiveEnterprise(String(invitation.enterprise_id)))) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
    }
    const session = await mongoose.startSession();
    let accepted: Awaited<ReturnType<UsersService['findById']>> = null;
    try {
      await session.withTransaction(async () => {
        const companyRole = invitation.role === 'recruiter' || invitation.role === 'enterprise_admin';
        if (!userInvitationRoles.includes(invitation.role as UserInvitationRole)
          || (companyRole && !invitation.enterprise_id)
          || (!companyRole && invitation.enterprise_id)) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        }
        if (invitation.enterprise_id && !(await this.enterprises.isActiveEnterprise(String(invitation.enterprise_id), session))) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
        if (companyRole && invitation.enterprise_id) {
          if (!await this.users.lockEnterpriseAdminChanges(invitation.enterprise_id as Types.ObjectId, session)) {
            throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
          }
        }
        const consumed = await this.invitations.accept(invitation._id as Types.ObjectId, userId, session);
        if (!consumed) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
        const target = await this.users.findByIdWithSession(userId, session);
        if (!target) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        accepted = await this.users.updateNewAccountFromInvitation(userId, invitation.role as UserInvitationRole, (invitation.enterprise_id as Types.ObjectId | null) ?? null, target.version ?? 0, session);
        if (!accepted) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.auth.updateLocalAccountPassword(userId, passwordHash, session);
        await this.audits.record({ targetUserId: userId, actorId: invitation.invited_by as Types.ObjectId, action: 'invitation_accepted', version: accepted.version ?? 0 }, session);
      });
    } finally { await session.endSession(); }
    if (!accepted) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    return { id: String(accepted._id), email: accepted.email, role: accepted.role, status: accepted.status };
  }

  async preview(token: string): Promise<{ email: string; role: string; enterpriseName: string | null; expiresAt: string }> {
    const tokenHash = this.hashToken(token);
    const invitation = await this.invitations.findPendingByHash(tokenHash);
    if (!invitation || invitation.kind !== 'new_account' || !userInvitationRoles.includes(invitation.role as UserInvitationRole)) {
      throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    }
    const target = await this.users.findById(String(invitation.target_user_id));
    if (!target || target.status !== 'invited') {
      throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    }
    let enterpriseName: string | null = null;
    if (invitation.enterprise_id) {
      enterpriseName = await this.enterprises.getActiveEnterpriseName(String(invitation.enterprise_id));
      if (!enterpriseName) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
    }
    return { email: target.email, role: String(invitation.role), enterpriseName, expiresAt: new Date(String(invitation.expires_at)).toISOString() };
  }

  async getStatus(actorId: string, targetId: string): Promise<InvitationStatus | null> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
    const target = await this.users.findById(targetId);
    if (!target) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'User not found');
    const invitation = await this.invitations.findLatestForTargetUser(target._id);
    if (!invitation) return null;
    return {
      status: String(invitation.status),
      kind: String(invitation.kind),
      role: String(invitation.role),
      expiresAt: new Date(String(invitation.expires_at)).toISOString(),
      sentAt: invitation.createdAt ? new Date(String(invitation.createdAt)).toISOString() : null,
      deliveryStatus: String(invitation.delivery_status),
      deliveryAttempts: Number(invitation.delivery_attempts ?? 0),
    };
  }

  async getStatuses(targetIds: string[]): Promise<Map<string, InvitationStatus>> {
    const invitations = await this.invitations.findLatestForTargets(targetIds.map((id) => new Types.ObjectId(id)));
    const now = Date.now();
    return new Map([...invitations].map(([id, invitation]) => {
      const rawStatus = String(invitation.status);
      const expired = rawStatus === 'pending' && new Date(String(invitation.expires_at)).getTime() <= now;
      return [id, {
        status: expired ? 'expired' : rawStatus,
        kind: String(invitation.kind),
        role: String(invitation.role),
        expiresAt: new Date(String(invitation.expires_at)).toISOString(),
        sentAt: invitation.createdAt ? new Date(String(invitation.createdAt)).toISOString() : null,
        deliveryStatus: String(invitation.delivery_status),
        deliveryAttempts: Number(invitation.delivery_attempts ?? 0),
      }];
    }));
  }

  async cancel(actorId: string, targetId: string, body: CancelInvitationBody): Promise<void> {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const actor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        const target = await this.users.findByIdWithSession(new Types.ObjectId(targetId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (!target || target.status !== 'invited') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        if ((target.version ?? 0) !== body.expectedVersion) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'The account changed. Reload and try again.');
        await this.users.serializeIdentityRequests(target._id, session);
        if (!await this.invitations.cancelPending(target._id, session)) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
        await this.audits.record({ targetUserId: target._id, actorId: actor._id, action: 'invitation_revoked', reason: body.reason, version: target.version ?? 0 }, session);
      });
    } finally { await session.endSession(); }
  }

  async resendInvitation(actorId: string, targetId: string): Promise<{ deliveryStatus: 'sent' | 'failed'; expiresAt: string }> {
    const actor = await this.users.findById(actorId);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
    const target = await this.users.findById(targetId);
    if (!target || target.status !== 'invited') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
    const token = randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + USER_INVITATION_TTL_MS);
    const session = await mongoose.startSession();
    let role: UserInvitationRole | undefined;
    let enterpriseId: Types.ObjectId | null = null;
    try {
      await session.withTransaction(async () => {
        const currentActor = await this.users.findByIdWithSession(new Types.ObjectId(actorId), session);
        const currentTarget = await this.users.findByIdWithSession(target._id, session);
        if (!currentActor || currentActor.role !== 'admin' || currentActor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (!currentTarget || currentTarget.status !== 'invited' || currentTarget.version !== target.version) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.INVALID_ACCEPTANCE);
        await this.users.serializeIdentityRequests(target._id, session);
        const latest = await this.invitations.findLatestForTargetUser(target._id, session);
        const resendable = latest && ['pending', 'revoked', 'cancelled', 'expired'].includes(String(latest.status))
          && latest.kind === 'new_account' && latest.role === currentTarget.role;
        if (!resendable) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
        role = latest.role as UserInvitationRole;
        enterpriseId = (latest.enterprise_id as Types.ObjectId | null) ?? null;
        if (enterpriseId && !(await this.enterprises.isActiveEnterprise(String(enterpriseId), session))) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
        if (enterpriseId && !await this.users.lockEnterpriseAdminChanges(enterpriseId, session)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_INVITATION_MESSAGES.COMPANY_UNAVAILABLE, 'COMPANY_UNAVAILABLE');
        if (latest.status === 'pending') await this.audits.record({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), action: 'invitation_revoked', reason: 'Superseded by a resent invitation', version: target.version ?? 0 }, session);
        await this.invitations.create({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), kind: 'new_account', role, enterpriseId, tokenHash, expiresAt }, session);
        await this.audits.record({ targetUserId: target._id, actorId: new Types.ObjectId(actorId), action: 'account_invited', version: target.version ?? 0, changes: { invitationResent: 'true' } }, session);
      });
    } finally { await session.endSession(); }
    if (!role) throw createHttpError(HTTP_STATUS.HTTP_410_GONE, USER_INVITATION_MESSAGES.INVALID);
    let sent = false;
    try { sent = await sendUserInvitationEmail(target.email, this.invitationUrl(token), role); } catch { sent = false; }
    await this.invitations.markDelivery(tokenHash, sent);
    return { deliveryStatus: sent ? 'sent' : 'failed', expiresAt: expiresAt.toISOString() };
  }
}

export const userInvitationsService = new UserInvitationsService();
