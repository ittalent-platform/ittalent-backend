import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersRepository, type UsersRepository, type CreateUserData } from './users.repository.js';
import type { UserDTO } from './users.schemas.js';

export class UsersService {
  constructor(private readonly repository: UsersRepository = usersRepository) {}

  mapUserDto(user: UserDoc): UserDTO {
    const raw = user.toObject();
    return {
      id: String(user._id),
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : undefined,
    };
  }

  async getUserById(id: string): Promise<UserDTO> {
    const user = await this.repository.findById(id);
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'User not found');
    }
    return this.mapUserDto(user);
  }

  async findByIdentifier(identifier: string): Promise<UserDoc | null> {
    return this.repository.findByIdentifier(identifier);
  }

  async findById(id: string): Promise<UserDoc | null> {
    return this.repository.findById(id);
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
}

export const usersService = new UsersService();
