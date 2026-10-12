import { Types } from 'mongoose';

import type { UserDoc, UserRole, UserStatus, UserStatusHistoryEntry } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { USER_LOG_TAGS, USER_MESSAGES, VALID_USER_STATUS_TRANSITIONS } from './users.constants.js';
import { usersRepository, type UsersRepository, type CreateUserData } from './users.repository.js';
import {
  strictUserDtoSchema,
  type CreateEmployeeBody,
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

export class UsersService {
  constructor(private readonly repository: UsersRepository = usersRepository) {}

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
    const current = await this.guardStore(() => this.repository.findById(id));
    if (!current) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }

    if (patch.role !== undefined && actorCtx.id === id && patch.role !== current.role) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_ROLE_CHANGE);
    }

    if (actorCtx.role === 'recruiter') {
      const recruiterEnterpriseId = await this.getEnterpriseId(actorCtx.id);
      if (!current.enterprise_id || String(current.enterprise_id) !== recruiterEnterpriseId) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
      }
      if (patch.role === 'admin') {
        throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.ADMIN_CREATE_RESTRICTED);
      }
    }

    const updated = await this.guardStore(() => this.repository.updateProfile(id, patch));
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
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
      effectiveQuery = {
        ...effectiveQuery,
        enterpriseId: recruiterEnterpriseId ?? '000000000000000000000000',
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

  async updateStatus(id: string, status: UserStatus, adminId?: string, reason?: string): Promise<UserDoc | null> {
    return this.repository.updateStatus(id, status, adminId, reason);
  }

  async getEnterpriseId(id: string): Promise<string | null> {
    const user = await this.repository.findById(id);
    return user?.enterprise_id ? String(user.enterprise_id) : null;
  }

  async assignEnterprise(id: string, enterpriseId: string): Promise<UserDoc | null> {
    return this.repository.updateEnterpriseId(id, enterpriseId);
  }

  async updateRole(id: string, role: UserRole): Promise<UserDoc | null> {
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
