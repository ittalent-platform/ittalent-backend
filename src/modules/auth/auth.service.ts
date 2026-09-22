import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { AUTH_CONFIG, AUTH_MESSAGES } from './auth.constants.js';
import { authRepository, type AuthRepository } from './auth.repository.js';
import type {
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RefreshTokenResponse,
  RegisterRequest,
  UserDTO,
} from './auth.schemas.js';

interface TokenPayload {
  sub: string;
  email: string;
  role: string;
}

type ValidExpiresIn = NonNullable<jwt.SignOptions['expiresIn']>;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository = authRepository,
    private readonly userService: UsersService = usersService,
  ) {}

  private generateTokens(user: { _id: unknown; email: string; role: string }): AuthTokens {
    const payload: TokenPayload = {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as ValidExpiresIn,
    });

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as ValidExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  private mapUserDto(user: UserDoc): UserDTO {
    return this.userService.mapUserDto(user);
  }

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const emailExists = await this.userService.existsByEmail(input.email);
    if (emailExists) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, AUTH_MESSAGES.USER_ALREADY_EXISTS);
    }

    const usernameExists = await this.userService.existsByUsername(input.username);
    if (usernameExists) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, AUTH_MESSAGES.USERNAME_ALREADY_EXISTS);
    }

    const user = await this.userService.createUser({
      email: input.email,
      username: input.username,
    });

    const password_hash = await bcrypt.hash(input.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

    await this.repository.createAccount({
      userId: user._id,
      provider: 'local',
      password_hash,
    });

    const tokens = this.generateTokens(user);
    return {
      user: this.mapUserDto(user),
      tokens,
    };
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.userService.findByIdentifier(input.identifier);
    if (!user) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const account = await this.repository.findLocalAccountByUserId(user._id);
    if (!account?.password_hash) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(input.password, account.password_hash);
    if (!isMatch) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.status !== 'active') {
      throw createHttpError(HTTP_STATUS.HTTP_403_FORBIDDEN, AUTH_MESSAGES.ACCOUNT_INACTIVE);
    }

    const tokens = this.generateTokens(user);
    return {
      user: this.mapUserDto(user),
      tokens,
    };
  }

  async refreshTokens(refreshToken: string): Promise<RefreshTokenResponse> {
    try {
      const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as unknown as TokenPayload;

      const user = await this.userService.findById(decoded.sub);
      if (!user || user.status !== 'active') {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, AUTH_MESSAGES.INVALID_REFRESH_TOKEN);
      }

      return this.generateTokens(user);
    } catch {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, AUTH_MESSAGES.INVALID_REFRESH_TOKEN);
    }
  }

  async getCurrentUser(userId: string): Promise<UserDTO> {
    return this.userService.getUserById(userId);
  }
}

export const authService = new AuthService();
