import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import type { UserDoc } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { consumeEmailDeliveryStatus, sendVerificationEmail } from '../../shared/services/email.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { AUTH_CONFIG, AUTH_MESSAGES, type VerificationStage } from './auth.constants.js';
import { authRepository, type AuthRepository } from './auth.repository.js';
import type {
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationEmailRequest,
  ResendVerificationEmailResponse,
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

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateVerificationToken(): string {
    return randomBytes(AUTH_CONFIG.TOKEN_BYTES).toString('hex');
  }

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

  async register(input: RegisterRequest): Promise<RegisterResponse> {
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
      status: 'inactive',
    });

    const password_hash = await bcrypt.hash(input.password, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);

    await this.repository.createAccount({
      userId: user._id,
      provider: 'local',
      password_hash,
    });

    const rawToken = this.generateVerificationToken();
    const tokenHash = this.hashToken(rawToken);

    await this.repository.createVerificationToken({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_WINDOW_MS),
    });

    const verificationUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
    let verificationEmailSent = true;
    try {
      await sendVerificationEmail(user.email, verificationUrl);
      verificationEmailSent = consumeEmailDeliveryStatus(user.email) !== false;
    } catch {
      verificationEmailSent = false;
    }

    const tokens = this.generateTokens(user);
    return {
      user: this.mapUserDto(user),
      tokens,
      verificationEmailSent,
    };
  }

  async verifyEmail(rawToken: string): Promise<{ stage: VerificationStage; code?: string }> {
    if (!rawToken || typeof rawToken !== 'string') {
      return { stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' };
    }

    const tokenHash = this.hashToken(rawToken);
    const tokenDoc = await this.repository.findVerificationTokenByHash(tokenHash);

    if (!tokenDoc) {
      return { stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' };
    }

    if (tokenDoc.status === 'used') {
      return { stage: 'already-verified', code: 'EMAIL_ALREADY_VERIFIED' };
    }

    if (tokenDoc.status === 'revoked') {
      return { stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' };
    }

    if (new Date(tokenDoc.expires_at) <= new Date()) {
      return { stage: 'expired', code: 'VERIFICATION_TOKEN_EXPIRED' };
    }

    await this.repository.markTokenUsed(tokenDoc._id);
    await this.userService.updateStatus(String(tokenDoc.user_id), 'active');

    return { stage: 'success' };
  }

  async resendVerificationEmail(input: ResendVerificationEmailRequest): Promise<ResendVerificationEmailResponse> {
    const user = await this.userService.findByEmail(input.email);

    if (!user || user.status !== 'inactive') {
      return {
        success: true,
        message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
        data: { verificationEmailSent: true },
      };
    }

    await this.repository.revokePriorVerificationTokens(user._id);

    const rawToken = this.generateVerificationToken();
    const tokenHash = this.hashToken(rawToken);

    await this.repository.createVerificationToken({
      userId: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_WINDOW_MS),
    });

    const verificationUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
    let verificationEmailSent = true;
    try {
      await sendVerificationEmail(user.email, verificationUrl);
      verificationEmailSent = consumeEmailDeliveryStatus(user.email) !== false;
    } catch {
      verificationEmailSent = false;
    }

    return {
      success: true,
      message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
      data: { verificationEmailSent },
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
