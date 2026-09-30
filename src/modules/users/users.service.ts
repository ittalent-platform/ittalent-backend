import type { UserDoc, UserRole, UserStatus } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError, isHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schemas.js';
import { USER_LOG_TAGS, USER_MESSAGES } from './users.constants.js';
import { usersRepository, type UsersRepository, type CreateUserData } from './users.repository.js';
import { strictUserDtoSchema, type UpdateUserBody, type UserDTO, type UserListQuery } from './users.schemas.js';

export class UsersService {
  constructor(private readonly repository: UsersRepository = usersRepository) {}

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
    if (!current) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
    if (patch.role !== undefined && actorId === id && patch.role !== current.role) {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, USER_MESSAGES.SELF_ROLE_CHANGE);
    }
    const updated = await this.guardStore(() => this.repository.updateProfile(id, patch));
    if (!updated) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, USER_MESSAGES.NOT_FOUND);
    }
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

  async updateStatus(id: string, status: UserStatus): Promise<UserDoc | null> {
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
