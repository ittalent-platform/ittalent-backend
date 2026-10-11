import mongoose, { Types } from 'mongoose';
import type { UserDoc, UserRole, UserStatus } from '../../models/user.model.js';
import type { UserInvitationRole } from '../../models/user-invitation.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { userAuditsService, type UserAuditsService } from '../user-audits/user-audits.service.js';
import { USER_LOG_TAGS, USER_MESSAGES } from './users.constants.js';
import { usersRepository, type UsersRepository, type CreateManagedUserInput, type CreateUserData } from './users.repository.js';
import { strictUserDtoSchema, type UpdateUserBody, type UserDTO, type UserListQuery, type StatusUpdateBody } from './users.schemas.js';

export class UsersService {
  async serializeIdentityRequests(id: Types.ObjectId, session: mongoose.ClientSession): Promise<void> {
    await this.repository.serializeIdentityRequests(id, session);
  }

  constructor(
    private readonly repository: UsersRepository = usersRepository,
    private readonly audits: UserAuditsService = userAuditsService,
  ) {}

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

  async promoteVerifiedUserFromInvitation(
    id: Types.ObjectId,
    enterpriseId: Types.ObjectId,
    expectedVersion: number,
    session: mongoose.ClientSession,
  ): Promise<UserDoc | null> {
    return this.repository.promoteVerifiedUserFromInvitation(id, enterpriseId, expectedVersion, session);
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
    const current = await this.guardStore(() => this.repository.findById(id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    if (!Object.keys(patch).some((key) => key !== 'expectedVersion')) return this.mapUserDto(current);
    const session = await mongoose.startSession();
    let updated: UserDoc | null = null;
    try {
      await session.withTransaction(async () => {
        const actor = await this.repository.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        updated = await this.repository.updateProfileVersioned(id, patch.expectedVersion, patch, session);
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT);
        await this.audits.record({ targetUserId: new Types.ObjectId(id), actorId: new Types.ObjectId(actorId), action: 'profile_updated', version: updated.version ?? 0, changes: {
          ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
          ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
        } }, session);
      });
    } finally { await session.endSession(); }
    if (!updated) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    return this.mapUserDto(updated);
  }

  async updateStatus(actorId: string, id: string, body: StatusUpdateBody): Promise<UserDTO> {
    const current = await this.guardStore(() => this.repository.findById(id));
    if (!current) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    if (current.status === body.status) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION);
    if (body.status === 'suspended' && current.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION);
    if (body.status === 'active' && current.status !== 'suspended' && current.status !== 'blocked') throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.INVALID_TRANSITION);
    if (actorId.toLowerCase() === String(current._id) && body.status === 'suspended') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_SUSPENSION);
    const session = await mongoose.startSession();
    let updated: UserDoc | null = null;
    try {
      await session.withTransaction(async () => {
        const actor = await this.repository.findByIdWithSession(new Types.ObjectId(actorId), session);
        if (!actor || actor.role !== 'admin' || actor.status !== 'active') throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, 'Active System Administrator permission required');
        if (body.status === 'suspended' && current.role === 'admin') {
          await this.repository.acquireAdminMutationLock(new Types.ObjectId(actorId), session);
          if (await this.repository.countActiveAdmins(session) <= 1) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.LAST_ADMIN);
        }
        updated = await this.repository.transitionStatus(id, body.expectedVersion, body.status as UserStatus, session);
        if (!updated) throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, USER_MESSAGES.VERSION_CONFLICT);
        await this.audits.record({ targetUserId: new Types.ObjectId(id), actorId: new Types.ObjectId(actorId), action: body.status === 'suspended' ? 'status_suspended' : 'status_reopened', reason: body.reason, version: updated.version ?? 0 }, session);
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

  async findRecruitersByEnterpriseId(enterpriseId: string): Promise<UserDoc[]> {
    return this.repository.findRecruitersByEnterpriseId(enterpriseId);
  }

  async blockExpiredInactiveUsers(cutoff: Date, excludedRoles?: UserRole[]): Promise<number> {
    return this.repository.blockExpiredInactiveUsers(cutoff, excludedRoles);
  }
}

export const usersService = new UsersService();
