import mongoose, { Types } from 'mongoose';

import type { UserDoc, UserRole, UserStatus, UserStatusHistoryEntry } from '../../models/user.model.js';
import type { UserInvitationRole } from '../../models/user-invitation.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import { USER_LOG_TAGS, USER_MESSAGES, VALID_USER_STATUS_TRANSITIONS } from './users.constants.js';
import { usersRepository, type UsersRepository, type CreateManagedUserInput, type CreateUserData } from './users.repository.js';
import {
  strictUserDtoSchema,
  type CreateEmployeeBody,
  type EmergencySuspensionBody,
  type RoleUpdateBody,
  type StatusUpdateBody,
  type UpdateUserBody,
  type UpdateUserStatusBody,
  type UserDTO,
  type UserHistoryItemDTO,
  type UserHistoryResponse,
  type UserListQuery,
} from './users.schemas.js';

export type ActorContext = string | { id: string; role?: string };

function parseActor(actor?: ActorContext): { id: string; role: string } {
  if (!actor) {
    throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
  }
  if (typeof actor === 'string') {
    return { id: actor, role: 'admin' };
  }
  if (!actor.id) {
    throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
  }
  return { id: actor.id, role: actor.role ?? 'admin' };
}

type AdminInvitationMetadata = { status: 'pending' | 'accepted' | 'revoked' | 'cancelled' | 'expired'; deliveryStatus: 'pending' | 'sent' | 'failed'; expiresAt: string; sentAt: string | null };

export interface AdminUserMetadata {
  enterpriseName: string | null;
  invitation: AdminInvitationMetadata | null;
}

export interface AdminUserMetadataResolver {
  resolve(userId: string, enterpriseId: string | null): Promise<AdminUserMetadata>;
  resolveMany(users: Array<{ id: string; enterpriseId: string | null }>): Promise<Map<string, AdminUserMetadata>>;
}

// History keeps who/what changed without storing raw personal values: first and last character only.
const MASK_EDGE_CHARS = 1;
const MONGO_NO_TRANSACTION_ERROR_CODE = 20;
function maskText(value: string): string {
  const hidden = value.length - MASK_EDGE_CHARS - MASK_EDGE_CHARS;
  return hidden <= 0 ? '*'.repeat(value.length) : `${value.slice(0, MASK_EDGE_CHARS)}${'*'.repeat(hidden)}${value.slice(-MASK_EDGE_CHARS)}`;
}

export class UsersService {
  constructor(
    private readonly repository: UsersRepository = usersRepository,
    private readonly audits: UserAuditsService = userAuditsService,
    private readonly adminMetadataResolver: AdminUserMetadataResolver = {
      resolve: async (userId, enterpriseId) => {
        const [{ enterprisesService }, { userInvitationsService }] = await Promise.all([
          import('../enterprises/enterprises.service.js'),
          import('../user-invitations/user-invitations.service.js'),
        ]);
        const [names, statuses] = await Promise.all([
          enterpriseId ? enterprisesService.getNamesByIds([enterpriseId]) : Promise.resolve(new Map<string, string>()),
          userInvitationsService.getStatuses([userId]),
        ]);
        const status = statuses.get(userId);
        return { enterpriseName: enterpriseId ? names.get(enterpriseId) ?? null : null, invitation: status ? { status: status.status as AdminInvitationMetadata['status'], deliveryStatus: status.deliveryStatus as AdminInvitationMetadata['deliveryStatus'], expiresAt: status.expiresAt, sentAt: status.sentAt } : null };
      },
      resolveMany: async (users) => {
        const [{ enterprisesService }, { userInvitationsService }] = await Promise.all([
          import('../enterprises/enterprises.service.js'),
          import('../user-invitations/user-invitations.service.js'),
        ]);
        const enterpriseIds = [...new Set(users.flatMap((user) => user.enterpriseId ? [user.enterpriseId] : []))];
        const [names, statuses] = await Promise.all([enterprisesService.getNamesByIds(enterpriseIds), userInvitationsService.getStatuses(users.map((user) => user.id))]);
        return new Map(users.map((user) => {
          const status = statuses.get(user.id);
          return [user.id, { enterpriseName: user.enterpriseId ? names.get(user.enterpriseId) ?? null : null, invitation: status ? { status: status.status as AdminInvitationMetadata['status'], deliveryStatus: status.deliveryStatus as AdminInvitationMetadata['deliveryStatus'], expiresAt: status.expiresAt, sentAt: status.sentAt } : null }];
        }));
      },
    },
    private readonly enterpriseLock: (id: Types.ObjectId, session: mongoose.ClientSession) => Promise<boolean> = async (id, session) => {
      const { enterprisesService } = await import('../enterprises/enterprises.service.js');
      return enterprisesService.incrementAdminMutationVersion(id, session);
    },
  ) {}

  async serializeIdentityRequests(id: Types.ObjectId, session: mongoose.ClientSession): Promise<void> {
    await this.repository.serializeIdentityRequests(id, session);
  }

  async lockEnterpriseAdminChanges(enterpriseId: Types.ObjectId, session: mongoose.ClientSession): Promise<boolean> {
    return this.enterpriseLock(enterpriseId, session);
  }

  async withAdminMetadata(user: UserDTO): Promise<UserDTO & AdminUserMetadata> {
    return this.guardStore(async () => ({ ...user, ...await this.adminMetadataResolver.resolve(user.id, user.enterpriseId) }));
  }

  async listUsersWithAdminMetadata(query: UserListQuery): Promise<PaginatedResult<UserDTO & AdminUserMetadata>> {
    const result = await this.listUsers(query);
    return this.guardStore(async () => {
      const metadata = await this.adminMetadataResolver.resolveMany(result.items.map(({ id, enterpriseId }) => ({ id, enterpriseId })));
      return { ...result, items: result.items.map((user) => ({ ...user, ...(metadata.get(user.id) ?? { enterpriseName: null, invitation: null }) })) };
    });
  }

  async createManagedUser(data: CreateManagedUserInput, session: mongoose.ClientSession): Promise<UserDoc> {
    return this.repository.createManagedUser(data, session);
  }

  async existsByEmailOrUsername(email: string, username: string, session: mongoose.ClientSession): Promise<boolean> {
    return this.repository.existsByEmailOrUsername(email, username, session);
  }

  async findByIdWithSession(id: Types.ObjectId, session: mongoose.ClientSession): Promise<UserDoc | null> {
    return this.repository.findByIdWithSession(id, session);
  }

  async updateNewAccountFromInvitation(
    id: Types.ObjectId,
    role: UserInvitationRole,
    enterpriseId: Types.ObjectId | null,
    expectedVersion: number,
    session: mongoose.ClientSession,
  ): Promise<UserDoc | null> {
    return this.repository.updateNewAccountFromInvitation(id, role, enterpriseId, expectedVersion, session);
  }

  async emailExists(email: string, exceptId?: Types.ObjectId): Promise<boolean> {
    return this.repository.emailExists(email, exceptId);
  }

  async updateEmailVersioned(id: Types.ObjectId, expectedVersion: number, email: string, session: mongoose.ClientSession): Promise<UserDoc | null> {
    return this.repository.updateEmailVersioned(id, expectedVersion, email, session);
  }

  mapUserDto(user: UserDoc): UserDTO {
    const raw = user.toObject();
    const dto: UserDTO = {
      id: String(user._id),
      email: user.email,
      username: user.username,
      fullName: raw.full_name ?? null,
      phone: raw.phone ?? null,
      role: user.role ?? 'user',
      status: user.status ?? 'active',
      emailVerified: raw.email_verified === true,
      enterpriseId: user.enterprise_id ? String(user.enterprise_id) : null,
      ...(raw.status_reason !== undefined && raw.status_reason !== null
        ? { statusReason: raw.status_reason }
        : {}),
      ...(raw.status_updated_at !== undefined && raw.status_updated_at !== null
        ? { statusUpdatedAt: new Date(raw.status_updated_at).toISOString() }
        : {}),
      ...(raw.status_updated_by !== undefined && raw.status_updated_by !== null
        ? { statusUpdatedBy: String(raw.status_updated_by) }
        : {}),
      createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
      version: raw.version ?? 0,
    };

    // Fail closed (UC-USER-01.EX.4 / UC-USER-02.EX.5 / BR-EMP-16)
    const checked = strictUserDtoSchema.safeParse(dto);
    if (!checked.success) {
      console.error(USER_LOG_TAGS.PROJECTION_ERROR, { userId: dto.id, issues: checked.error.issues });
      throw createHttpError(HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR, USER_MESSAGES.PROJECTION_FAILED);
    }
    return checked.data;
  }

  // UC-USER-01.EX.3 / UC-USER-02.EX.4 / UC-EMP-01.E3: storage failure is logged and masked
  private async guardStore<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isHttpError(error)) {
        throw error;
      }
      console.error(USER_LOG_TAGS.STORE_ERROR, error);
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, USER_MESSAGES.STORE_UNAVAILABLE);
    }
  }

  /** UC 10: Create employee account */
  async createEmployee(
    actor: ActorContext,
    data: CreateEmployeeBody,
  ): Promise<UserDTO> {
    const actorCtx = parseActor(actor);
    return this.guardStore(async () => {
      let targetEnterpriseId: string | null = null;

      if (actorCtx.role === 'recruiter') {
        targetEnterpriseId = await this.getEnterpriseId(actorCtx.id);
        if (!targetEnterpriseId) {
          throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, USER_MESSAGES.NO_ENTERPRISE);
        }
        if (data.role === 'admin') {
          throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.ADMIN_CREATE_RESTRICTED);
        }
      } else {
        targetEnterpriseId = data.enterpriseId ?? null;
      }

      const emailExists = await this.existsByEmail(data.email.toLowerCase());
      if (emailExists) {
        throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.EMAIL_EXISTS);
      }

      // Generate a collision-free username based on the corporate email prefix
      const baseUsername =
        data.email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'employee';
      let username = baseUsername;
      let counter = 1;
      while (await this.existsByUsername(username)) {
        username = `${baseUsername}${counter++}`;
      }

      const created = await this.repository.createUser({
        email: data.email.toLowerCase(),
        username,
        full_name: data.fullName,
        phone: data.phone ?? undefined,
        role: data.role as UserRole,
        status: (data.status as UserStatus) ?? 'active',
        enterprise_id: targetEnterpriseId ? new Types.ObjectId(targetEnterpriseId) : null,
      });

      return this.mapUserDto(created);
    });
  }

  /** UC 14: View an employee detail */
  async getUserById(id: string, actor?: ActorContext): Promise<UserDTO> {
    const user = await this.guardStore(() => this.repository.findById(id));
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }

    const actorCtx = actor ? parseActor(actor) : undefined;
    if (actorCtx?.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!user.enterprise_id || String(user.enterprise_id) !== recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      }
    }

    return this.mapUserDto(user);
  }

  /** UC 11: Update employee information (status updates must go through updateUserStatus) */
  async updateUser(
    actor: ActorContext,
    id: string,
    patch: UpdateUserBody,
  ): Promise<UserDTO> {
    const actorCtx = parseActor(actor);

    if (patch.expectedVersion !== undefined) {
      const expectedVersion = patch.expectedVersion;
      const session = await mongoose.startSession();
      let result: UserDoc | null = null;
      try {
        const runUpdate = async (sess?: mongoose.ClientSession): Promise<void> => {
          const adminActor = sess
            ? await this.repository.findByIdWithSession(new Types.ObjectId(actorCtx.id), sess)
            : await this.repository.findById(actorCtx.id);
          if (!adminActor || adminActor.role !== 'admin' || adminActor.status !== 'active') {
            throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
          }
          const current = sess
            ? await this.repository.findByIdWithSession(new Types.ObjectId(id), sess)
            : await this.repository.findById(id);
          if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
          if ((current.version ?? 0) !== expectedVersion) {
            throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
          }
          // Only fields whose value really differs are written; a no-op leaves version and audit untouched.
          const changes: UpdateUserBody = { expectedVersion };
          if (patch.fullName !== undefined && patch.fullName !== (current.full_name ?? null)) changes.fullName = patch.fullName;
          if (patch.phone !== undefined && patch.phone !== (current.phone ?? null)) changes.phone = patch.phone;
          if (Object.keys(changes).length === 1) {
            result = current;
            return;
          }
          const updated = await this.repository.updateProfileVersioned(id, expectedVersion, changes, sess);
          if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
          await this.audits.record({
            targetUserId: new Types.ObjectId(id),
            actorId: new Types.ObjectId(actorCtx.id),
            action: 'profile_updated',
            version: updated.version ?? 0,
            changes: {
              ...(changes.fullName !== undefined ? { fullName: maskText(changes.fullName) } : {}),
              ...(changes.phone !== undefined ? { phone: changes.phone === null ? '' : maskText(changes.phone) } : {}),
            },
          }, sess);
          result = updated;
        };

        await this.guardStore(async () => {
          try {
            await session.withTransaction(() => runUpdate(session));
          } catch (err: unknown) {
            if (isHttpError(err)) throw err;
            if ((err as { code?: number })?.code === MONGO_NO_TRANSACTION_ERROR_CODE || (err as Error)?.message?.includes('replica set member')) {
              await runUpdate();
            } else {
              throw err;
            }
          }
        });
      } finally {
        await session.endSession();
      }
      if (!result) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      return this.mapUserDto(result);
    }

    const current = await this.guardStore(() => this.repository.findById(id));
    if (!current) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }

    const patchRole = (patch as { role?: string }).role;
    if (patchRole !== undefined && actorCtx.id === id && patchRole !== current.role) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_ROLE_CHANGE);
    }

    if (actorCtx.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!current.enterprise_id || String(current.enterprise_id) !== recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      }
      if (patchRole === 'admin') {
        throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.ADMIN_CREATE_RESTRICTED);
      }
    }

    const updated = await this.guardStore(() => this.repository.updateProfile(id, patch));
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
    return this.mapUserDto(updated);
  }

  async updateStatus(actorId: string, id: string, body: StatusUpdateBody, emergency = false): Promise<UserDTO> {
    if (actorId.toLowerCase() === id.toLowerCase() && body.status === 'suspended') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_SUSPENSION);
    const session = await mongoose.startSession();
    let updated: UserDoc | null = null;
    try {
      await this.guardStore(() => session.withTransaction(async () => {
        const actor = await this.repository.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        const latest = await this.repository.findByIdWithSession(new Types.ObjectId(id), session);
        if (!latest) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
        if ((latest.version ?? 0) !== body.expectedVersion) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
        const reopening = body.status === 'active' && (latest.status === 'suspended' || latest.status === 'blocked');
        const suspending = body.status === 'suspended' && latest.status === 'active';
        if (!reopening && !suspending) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
        if (emergency && latest.role !== 'enterprise_admin') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
        if (body.status === 'suspended' && latest.role === 'admin') {
          await this.repository.acquireAdminMutationLock(new Types.ObjectId(actorId), session);
          if (await this.repository.countActiveAdmins(session) <= 1) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.LAST_ADMIN, 'LAST_ADMIN');
        }
        if (body.status === 'suspended' && latest.role === 'enterprise_admin' && latest.enterprise_id) {
          const enterpriseId = latest.enterprise_id as Types.ObjectId;
        if (!await this.lockEnterpriseAdminChanges(enterpriseId, session)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
          if (await this.repository.countActiveEnterpriseAdmins(enterpriseId, session) <= 1 && !emergency) {
            throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.LAST_ENTERPRISE_ADMIN, 'LAST_ENTERPRISE_ADMIN');
          }
        }
        updated = await this.repository.transitionStatus(id, body.expectedVersion, body.status as UserStatus, session);
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
        await this.audits.record({ targetUserId: new Types.ObjectId(id), actorId: new Types.ObjectId(actorId), action: body.status === 'suspended' ? 'status_suspended' : 'status_reopened', reason: body.reason, ...(emergency ? { changes: { emergency: 'true' } } : {}), version: updated.version ?? 0 }, session);
      }));
    } finally { await session.endSession(); }
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    return this.mapUserDto(updated);
  }

  async emergencySuspend(actorId: string, id: string, body: EmergencySuspensionBody): Promise<UserDTO> {
    const target = await this.guardStore(() => this.repository.findById(id));
    if (!target || target.role !== 'enterprise_admin') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
    return this.updateStatus(actorId, id, { ...body, status: 'suspended' }, true);
  }

  async updateRole(actorId: string, id: string, body: RoleUpdateBody): Promise<UserDTO> {
    const session = await mongoose.startSession();
    let updated: UserDoc | null = null;
    try {
      await session.withTransaction(async () => {
        const actor = await this.repository.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        const current = await this.repository.findByIdWithSession(new Types.ObjectId(id), session);
        if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
        if (current.role === body.role || (current.role !== 'recruiter' && current.role !== 'enterprise_admin') || !current.enterprise_id) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
        }
        const enterpriseId = current.enterprise_id as Types.ObjectId;
        if (!await this.lockEnterpriseAdminChanges(enterpriseId, session)) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION, 'INVALID_TRANSITION');
        if (current.role === 'enterprise_admin' && await this.repository.countActiveEnterpriseAdmins(enterpriseId, session) <= 1) {
          throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.LAST_ENTERPRISE_ADMIN, 'LAST_ENTERPRISE_ADMIN');
        }
        updated = await this.repository.transitionRole(id, body, session);
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
        await this.audits.record({
          targetUserId: current._id,
          actorId: new Types.ObjectId(actorId),
          action: 'role_changed',
          reason: body.reason,
          changes: { previousRole: current.role, role: body.role },
          version: updated.version ?? 0,
        }, session);
      });
    } finally { await session.endSession(); }
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    return this.mapUserDto(updated);
  }

  /** UC 12: Update an employee's status with mandatory audit trail & lifecycle checks */
  async updateUserStatus(
    actor: ActorContext,
    id: string,
    body: UpdateUserStatusBody,
  ): Promise<UserDTO> {
    const actorCtx = parseActor(actor);
    const current = await this.guardStore(() => this.repository.findById(id));
    if (!current) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }

    // BR-EMP-10: Self-suspension prohibition
    if (actorCtx.id === id && body.status === 'suspended') {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_SUSPENSION);
    }

    // BR-EMP-13: Justification reason required when suspending
    if (body.status === 'suspended' && (!body.reason || body.reason.trim().length === 0)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, USER_MESSAGES.REASON_REQUIRED);
    }

    // Multi-tenancy isolation for recruiters
    if (actorCtx.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!current.enterprise_id || String(current.enterprise_id) !== recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      }
    }

    // Validate status transition against domain lifecycle rules
    const currentStatus = (current.status ?? 'active') as UserStatus;
    const allowedTransitions = VALID_USER_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowedTransitions.includes(body.status as UserStatus)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, USER_MESSAGES.INVALID_STATUS_TRANSITION);
    }

    const updated = await this.guardStore(() =>
      this.repository.updateStatus(id, body.status as UserStatus, actorCtx.id, body.reason),
    );
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
    return this.mapUserDto(updated);
  }

  /** UC 13 & UC 16: View employee list, search & filter */
  async listUsers(
    query: UserListQuery,
    actor?: ActorContext,
  ): Promise<PaginatedResult<UserDTO>> {
    let effectiveQuery = { ...query };

    // Enforce recruiter tenancy boundary automatically
    const actorCtx = actor ? parseActor(actor) : undefined;
    if (actorCtx?.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Recruiter has no enterprise affiliation');
      }
      effectiveQuery = {
        ...effectiveQuery,
        enterpriseId: [recruiterEnterpriseId],
      };
    }

    const { items, total } = await this.guardStore(() => this.repository.findPage(effectiveQuery));
    return {
      items: items.map((user) => this.mapUserDto(user)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  /** UC 15: View employee history (preserves full audit trail across all transitions) */
  async getUserHistory(
    id: string,
    actor?: ActorContext,
  ): Promise<UserHistoryResponse> {
    const user = await this.guardStore(() => this.repository.findById(id));
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }

    const actorCtx = actor ? parseActor(actor) : undefined;
    if (actorCtx?.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!user.enterprise_id || String(user.enterprise_id) !== recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      }
    }

    const raw = user.toObject();
    const items: UserHistoryItemDTO[] = [];

    // 1. Creation event
    items.push({
      id: `evt-${String(user._id)}-created`,
      action: 'Account Provisioned',
      description: `Account initialized with role ${user.role ?? 'recruiter'}`,
      timestamp: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
      actorId: null,
      actorName: 'System / Enterprise Administrator',
    });

    // 2. Status update events from append-only status_history (UC 15)
    if (raw.status_history && raw.status_history.length > 0) {
      raw.status_history.forEach((entry: UserStatusHistoryEntry, idx: number) => {
        items.push({
          id: `evt-${String(user._id)}-status-${idx}`,
          action: `Status Transition: ${entry.status}`,
          description: entry.reason
            ? `Status changed to ${entry.status} (Reason: ${entry.reason})`
            : `Operational status updated to ${entry.status}`,
          timestamp: new Date(entry.changed_at).toISOString(),
          actorId: entry.changed_by ? String(entry.changed_by) : null,
          actorName: 'Administrator',
        });
      });
    } else if (raw.status_updated_at) {
      items.push({
        id: `evt-${String(user._id)}-status`,
        action: `Status Transition: ${user.status}`,
        description: raw.status_reason
          ? `Status changed to ${user.status} (Reason: ${raw.status_reason})`
          : `Operational status updated to ${user.status}`,
        timestamp: new Date(raw.status_updated_at).toISOString(),
        actorId: raw.status_updated_by ? String(raw.status_updated_by) : null,
        actorName: 'Administrator',
      });
    }

    // 3. Profile update event if updatedAt differs from createdAt
    if (raw.updatedAt && raw.createdAt && new Date(raw.updatedAt).getTime() > new Date(raw.createdAt).getTime()) {
      items.push({
        id: `evt-${String(user._id)}-updated`,
        action: 'Profile Updated',
        description: 'Account profile attributes or contact details were modified',
        timestamp: new Date(raw.updatedAt).toISOString(),
        actorId: null,
        actorName: 'Administrator',
      });
    }

    // Sort descending by timestamp (newest first)
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { items };
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    return this.repository.findByIdentifier(identifier);
  }

  async findById(id: string): Promise<UserDoc | null> {
    return this.repository.findById(id);
  }

  async findByEmail(email: string): Promise<UserDoc | null> {
    return this.repository.findByEmail(email);
  }

  // For modules that reference people (for example the participants of an interview): they read through the users
  // module instead of querying the User model themselves.
  async findByIds(ids: string[]): Promise<UserDoc[]> {
    return this.repository.findByIds(ids);
  }

  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    return this.repository.findNamesByIds(ids);
  }

  async findIdsByKeyword(keyword: string, limit: number): Promise<string[]> {
    return this.repository.findIdsByKeyword(keyword, limit);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.repository.existsByEmail(email);
  }

  async existsByUsername(username: string): Promise<boolean> {
    return this.repository.existsByUsername(username);
  }

  async createUser(data: CreateUserData): Promise<UserDoc> {
    return this.repository.createUser(data);
  }

  async markEmailVerified(id: string): Promise<UserDoc | null> {
    return this.repository.markEmailVerified(id);
  }

  async updateStatusById(id: string, status: UserStatus, adminId?: string, reason?: string): Promise<UserDoc | null> {
    return this.repository.updateStatus(id, status, adminId, reason);
  }

  async getEnterpriseId(id: string): Promise<string | null> {
    const user = await this.repository.findById(id);
    return user?.enterprise_id ? String(user.enterprise_id) : null;
  }

  async assignEnterprise(id: string, enterpriseId: string): Promise<UserDoc | null> {
    return this.repository.updateEnterpriseId(id, enterpriseId);
  }

  async assignRole(id: string, role: UserRole): Promise<UserDoc | null> {
    return this.repository.updateRole(id, role);
  }

  async findRecruitersByEnterpriseId(enterpriseId: string): Promise<UserDoc[]> {
    return this.repository.findRecruitersByEnterpriseId(enterpriseId);
  }

  async blockExpiredInactiveUsers(cutoff: Date, excludedRoles?: UserRole[]): Promise<number> {
    return this.repository.blockExpiredInactiveUsers(cutoff, excludedRoles);
  }
}

export const usersService = new UsersService();
