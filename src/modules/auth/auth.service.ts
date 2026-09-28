import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env.js';
import type { UserDoc, UserStatus } from '../../models/user.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { TIME_MS } from '../../shared/constants/time.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  consumeEmailDeliveryStatus,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from '../../shared/services/email.service.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { AUTH_CONFIG, AUTH_MESSAGES, type VerificationStage } from './auth.constants.js';
import { authRepository, type AuthRepository } from './auth.repository.js';
import type {
  AuthResponse,
  AuthTokens,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  RefreshTokenResponse,
  RegisterRequest,
  RegisterResponse,
  ResendVerificationEmailRequest,
  ResendVerificationEmailResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  ResetPasswordTokenResponse,
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

  private isUserAllowedToLogin(user: { status?: UserStatus; createdAt?: Date | string }): boolean {
    if (user.status === 'active') {
      return true;
    }

    if (user.status === 'inactive' && user.createdAt) {
      const createdTime = new Date(user.createdAt).getTime();
      return Date.now() - createdTime <= env.EMAIL_VERIFICATION_WINDOW_MS;
    }

    return false;
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

    if (!this.isUserAllowedToLogin(user)) {
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
      if (!user || !this.isUserAllowedToLogin(user)) {
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

  async requestPasswordReset(input: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const user = await this.userService.findByEmail(input.email);

    if (user && (user.status === 'active' || user.status === 'inactive')) {
      await this.repository.revokePriorPasswordResetTokens(user._id);

      const rawToken = this.generateVerificationToken();
      const tokenHash = this.hashToken(rawToken);

      await this.repository.createPasswordResetToken({
        userId: user._id,
        tokenHash,
        expiresAt: new Date(Date.now() + env.RESET_PASSWORD_TOKEN_WINDOW_SECONDS * TIME_MS.ONE_SECOND),
      });

      const resetUrl = `${env.APP_BASE_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
      await sendResetPasswordEmail(user.email, resetUrl);
    }

    return {
      success: true,
      message: AUTH_MESSAGES.RESET_PASSWORD_EMAIL_SENT,
      data: {},
    };
  }

  async checkResetPasswordToken(rawToken: string): Promise<ResetPasswordTokenResponse> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, AUTH_MESSAGES.INVALID_RESET_TOKEN, 'INVALID_RESET_TOKEN');
    }

    const tokenHash = this.hashToken(rawToken);
    const tokenDoc = await this.repository.findPasswordResetTokenByHash(tokenHash);

    if (!tokenDoc) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, AUTH_MESSAGES.INVALID_RESET_TOKEN, 'INVALID_RESET_TOKEN');
    }

    if (tokenDoc.status !== 'pending' || new Date(tokenDoc.expires_at) <= new Date()) {
      throw createHttpError(
        HTTP_STATUS.HTTP_410_GONE,
        AUTH_MESSAGES.RESET_TOKEN_UNAVAILABLE,
        'RESET_TOKEN_UNAVAILABLE',
      );
    }

    return {
      success: true,
      data: { valid: true },
    };
  }

  async resetPassword(input: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    if (!input.token || typeof input.token !== 'string') {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, AUTH_MESSAGES.INVALID_RESET_TOKEN, 'INVALID_RESET_TOKEN');
    }

    const tokenHash = this.hashToken(input.token);
    const tokenDoc = await this.repository.findPasswordResetTokenByHash(tokenHash);

    if (!tokenDoc) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, AUTH_MESSAGES.INVALID_RESET_TOKEN, 'INVALID_RESET_TOKEN');
    }

    if (tokenDoc.status !== 'pending' || new Date(tokenDoc.expires_at) <= new Date()) {
      throw createHttpError(
        HTTP_STATUS.HTTP_410_GONE,
        AUTH_MESSAGES.RESET_TOKEN_UNAVAILABLE,
        'RESET_TOKEN_UNAVAILABLE',
      );
    }


    const passwordHash = await bcrypt.hash(input.newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    await this.repository.updateLocalAccountPassword(tokenDoc.user_id, passwordHash);

    const user = await this.userService.findById(tokenDoc.user_id);
    if (user && user.status === 'inactive') {
      await this.userService.updateStatus(String(tokenDoc.user_id), 'active');
    }

    await this.repository.markTokenUsed(tokenDoc._id);

    return {
      success: true,
      message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS,
      data: {},
    };
  }

  async changePassword(userId: string, input: ChangePasswordRequest): Promise<ChangePasswordResponse> {
    const account = await this.repository.findLocalAccountByUserId(userId);
    if (!account?.password_hash) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AUTH_MESSAGES.ACCOUNT_HAS_NO_PASSWORD);
    }

    const isCurrentValid = await bcrypt.compare(input.currentPassword, account.password_hash);
    if (!isCurrentValid) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AUTH_MESSAGES.INVALID_CURRENT_PASSWORD);
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, AUTH_CONFIG.BCRYPT_SALT_ROUNDS);
    await this.repository.updateLocalAccountPassword(userId, newPasswordHash);

    return {
      success: true,
      message: AUTH_MESSAGES.PASSWORD_CHANGED_SUCCESS,
      data: {},
    };
  }

  async blockExpiredUnverifiedUsers(): Promise<number> {
    const cutoff = new Date(Date.now() - env.EMAIL_VERIFICATION_WINDOW_MS);
    return this.userService.blockExpiredInactiveUsers(cutoff);
  }

  startAuthVerificationJob(): () => void {
    void this.blockExpiredUnverifiedUsers();

    const interval = setInterval(() => {
      void this.blockExpiredUnverifiedUsers();
    }, env.AUTH_VERIFICATION_JOB_INTERVAL_MS);

    return () => clearInterval(interval);
  }
}

export const authService = new AuthService();

export function startAuthVerificationJob(): () => void {
  return authService.startAuthVerificationJob();
}

