import mongoose, { Types } from 'mongoose';
import type { UserDoc, UserRole, UserStatus } from '../../models/user.model.js';
import type { UserInvitationRole } from '../../models/user-invitation.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import { USER_LOG_TAGS, USER_MESSAGES } from './users.constants.js';
import { usersRepository, type UsersRepository, type CreateManagedUserInput, type CreateUserData } from './users.repository.js';
import { strictUserDtoSchema, type EmergencySuspensionBody, type RoleUpdateBody, type UpdateUserBody, type UserDTO, type UserListQuery, type StatusUpdateBody } from './users.schemas.js';

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
    const dto = {
      id: String(user._id),
      email: user.email,
      username: user.username,
      fullName: raw.full_name ?? null,
      phone: raw.phone ?? null,
      role: user.role,
      status: user.status,
      emailVerified: raw.email_verified === true,
      enterpriseId: user.enterprise_id ? String(user.enterprise_id) : null,
      createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
      version: raw.version ?? 0,
    };

    // Fail closed (UC-USER-01.EX.4 / UC-USER-02.EX.5): only this exact, allow-listed shape may leave the service.
    const checked = strictUserDtoSchema.safeParse(dto);
    if (!checked.success) {
      console.error(USER_LOG_TAGS.PROJECTION_ERROR, { userId: dto.id, issues: checked.error.issues });
      throw createHttpError(HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR, USER_MESSAGES.PROJECTION_FAILED);
    }
    return checked.data;
  }

  // UC-USER-01.EX.3 / UC-USER-02.EX.4: a storage failure is logged and reported without internal details.
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

  async getUserById(id: string): Promise<UserDTO> {
    const user = await this.guardStore(() => this.repository.findById(id));
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
    return this.mapUserDto(user);
  }

  async updateUser(actorId: string, id: string, patch: UpdateUserBody): Promise<UserDTO> {
    const session = await mongoose.startSession();
    let result: UserDoc | null = null;
    try {
      await this.guardStore(() => session.withTransaction(async () => {
        const actor = await this.repository.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        const current = await this.repository.findByIdWithSession(new Types.ObjectId(id), session);
        if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
        if ((current.version ?? 0) !== patch.expectedVersion) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
        // Only fields whose value really differs are written; a no-op leaves version and audit untouched.
        const changes: UpdateUserBody = { expectedVersion: patch.expectedVersion };
        if (patch.fullName !== undefined && patch.fullName !== (current.full_name ?? null)) changes.fullName = patch.fullName;
        if (patch.phone !== undefined && patch.phone !== (current.phone ?? null)) changes.phone = patch.phone;
        if (Object.keys(changes).length === 1) {
          result = current;
          return;
        }
        const updated = await this.repository.updateProfileVersioned(id, patch.expectedVersion, changes, session);
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT, 'VERSION_CONFLICT');
        await this.audits.record({ targetUserId: new Types.ObjectId(id), actorId: new Types.ObjectId(actorId), action: 'profile_updated', version: updated.version ?? 0, changes: {
          ...(changes.fullName !== undefined ? { fullName: maskText(changes.fullName) } : {}),
          ...(changes.phone !== undefined ? { phone: changes.phone === null ? '' : maskText(changes.phone) } : {}),
        } }, session);
        result = updated;
      }));
    } finally { await session.endSession(); }
    if (!result) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    return this.mapUserDto(result);
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

  async listUsers(query: UserListQuery): Promise<PaginatedResult<UserDTO>> {
    const { items, total } = await this.guardStore(() => this.repository.findPage(query));
    return {
      items: items.map((user) => this.mapUserDto(user)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
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

  async updateStatusById(id: string, status: UserStatus): Promise<UserDoc | null> {
    return this.repository.updateStatus(id, status);
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
