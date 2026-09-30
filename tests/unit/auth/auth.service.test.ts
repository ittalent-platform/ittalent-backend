import { describe, expect, it, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { AuthService } from '../../../src/modules/auth/auth.service.js';
import type { AuthRepository } from '../../../src/modules/auth/auth.repository.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { env } from '../../../src/config/env.js';

describe('AuthService', () => {
  let mockAuthRepo: Partial<AuthRepository>;
  let mockUserService: Partial<UsersService>;
  let authService: AuthService;

  beforeEach(() => {
    mockAuthRepo = {
      createAccount: vi.fn(),
      findLocalAccountByUserId: vi.fn(),
      findAccountByProvider: vi.fn(),
      createVerificationToken: vi.fn().mockResolvedValue({} as never),
      findVerificationTokenByHash: vi.fn(),
      markTokenUsed: vi.fn(),
      revokePriorVerificationTokens: vi.fn(),
      createPasswordResetToken: vi.fn().mockResolvedValue({} as never),
      findPasswordResetTokenByHash: vi.fn(),
      revokePriorPasswordResetTokens: vi.fn(),
      updateLocalAccountPassword: vi.fn(),
    };
    mockUserService = {
      existsByEmail: vi.fn(),
      existsByUsername: vi.fn(),
      createUser: vi.fn(),
      findByIdentifier: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      updateStatus: vi.fn(),
      markEmailVerified: vi.fn(),
      getUserById: vi.fn(),
      mapUserDto: vi.fn((user) => ({
        id: String(user._id),
        email: user.email,
        username: user.username,
        fullName: user.full_name ?? null,
        phone: user.phone ?? null,
        role: user.role,
        status: user.status,
        emailVerified: user.email_verified === true,
        enterpriseId: user.enterprise_id ? String(user.enterprise_id) : null,
      })),
      blockExpiredInactiveUsers: vi.fn(),
    };
    authService = new AuthService(
      mockAuthRepo as AuthRepository,
      mockUserService as UsersService,
    );
  });

  describe('register', () => {
    it('creates a user and local account, and returns auth tokens', async () => {
      mockUserService.existsByEmail = vi.fn().mockResolvedValue(false);
      mockUserService.existsByUsername = vi.fn().mockResolvedValue(false);
      mockUserService.createUser = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'inactive',
      } as never);
      mockAuthRepo.createAccount = vi.fn().mockResolvedValue({} as never);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
      });

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        status: 'inactive',
      });
      expect(mockAuthRepo.createAccount).toHaveBeenCalled();
      expect(mockAuthRepo.createVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-id-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(result.verificationEmailSent).toBe(true);
    });

    it('throws 409 when user with email already exists', async () => {
      mockUserService.existsByEmail = vi.fn().mockResolvedValue(true);

      await expect(
        authService.register({
          email: 'existing@example.com',
          password: 'password123',
          username: 'testuser',
        }),
      ).rejects.toThrow();
    });

    it('throws 409 when user with username already exists', async () => {
      mockUserService.existsByEmail = vi.fn().mockResolvedValue(false);
      mockUserService.existsByUsername = vi.fn().mockResolvedValue(true);

      await expect(
        authService.register({
          email: 'new@example.com',
          password: 'password123',
          username: 'existinguser',
        }),
      ).rejects.toThrow();
    });
  });

  describe('login', () => {
    it('authenticates user with email identifier and returns tokens', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('authenticates user with username identifier and returns tokens', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      const result = await authService.login({
        identifier: 'testuser',
        password: 'password123',
      });

      expect(result.user.username).toBe('testuser');
      expect(result.tokens.accessToken).toBeDefined();
    });

    it('throws 401 when password does not match', async () => {
      const passwordHash = await bcrypt.hash('different-password', 10);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      await expect(
        authService.login({
          identifier: 'test@example.com',
          password: 'wrong-password',
        }),
      ).rejects.toThrow();
    });

    it('throws 401 when user identifier not found', async () => {
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'unknown@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow();
    });

    it('throws 401 when local account not found for user', async () => {
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'oauth@example.com',
        username: 'oauthuser',
        status: 'active',
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'oauth@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow();
    });

    it('allows unverified inactive user within 24-hour verification window to log in', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'inactive',
        createdAt: new Date(),
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'password123',
      });

      expect(result.tokens.accessToken).toBeDefined();
    });

    it('throws 403 when inactive user verification window has expired (> 24 hours)', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      const expiredCreatedAt = new Date(Date.now() - env.EMAIL_VERIFICATION_WINDOW_MS - 1000);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'inactive',
        createdAt: expiredCreatedAt,
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      await expect(
        authService.login({
          identifier: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it('throws 403 when user is blocked', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockUserService.findByIdentifier = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'blocked',
        createdAt: new Date(),
      } as never);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-id-1',
        user_id: 'user-id-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      await expect(
        authService.login({
          identifier: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('refreshTokens', () => {
    it('returns new tokens for a valid refresh token', async () => {
      const refreshToken = jwt.sign(
        { sub: 'user-id-1', email: 'test@example.com', role: 'user' },
        env.JWT_REFRESH_SECRET,
      );

      mockUserService.findById = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      } as never);

      const tokens = await authService.refreshTokens(refreshToken);

      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
    });

    it('allows unverified inactive user within 24-hour verification window to refresh tokens', async () => {
      const refreshToken = jwt.sign(
        { sub: 'user-id-1', email: 'test@example.com', role: 'user' },
        env.JWT_REFRESH_SECRET,
      );

      mockUserService.findById = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'inactive',
        createdAt: new Date(),
      } as never);

      const tokens = await authService.refreshTokens(refreshToken);

      expect(tokens.accessToken).toBeDefined();
    });

    it('throws 401 when inactive user exceeds verification window on refresh', async () => {
      const refreshToken = jwt.sign(
        { sub: 'user-id-1', email: 'test@example.com', role: 'user' },
        env.JWT_REFRESH_SECRET,
      );

      mockUserService.findById = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'inactive',
        createdAt: new Date(Date.now() - env.EMAIL_VERIFICATION_WINDOW_MS - 1000),
      } as never);

      await expect(authService.refreshTokens(refreshToken)).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  describe('getCurrentUser', () => {
    it('delegates to userService.getUserById', async () => {
      const mockUser = {
        id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      };
      mockUserService.getUserById = vi.fn().mockResolvedValue(mockUser);

      const result = await authService.getCurrentUser('user-id-1');

      expect(mockUserService.getUserById).toHaveBeenCalledWith('user-id-1');
      expect(result).toEqual(mockUser);
    });
  });

  describe('verifyEmail', () => {
    it('returns invalid stage when rawToken is empty or invalid string', async () => {
      const result = await authService.verifyEmail('');
      expect(result).toEqual({ stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' });
    });

    it('returns invalid stage when token is not found in repository', async () => {
      mockAuthRepo.findVerificationTokenByHash = vi.fn().mockResolvedValue(null);
      const result = await authService.verifyEmail('nonexistent-token');
      expect(result).toEqual({ stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' });
    });

    it('returns already-verified stage when token status is used', async () => {
      mockAuthRepo.findVerificationTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        user_id: 'user-1',
        status: 'used',
        expires_at: new Date(Date.now() + 60000),
      } as never);

      const result = await authService.verifyEmail('used-token');
      expect(result).toEqual({ stage: 'already-verified', code: 'EMAIL_ALREADY_VERIFIED' });
    });

    it('returns invalid stage when token status is revoked', async () => {
      mockAuthRepo.findVerificationTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        user_id: 'user-1',
        status: 'revoked',
        expires_at: new Date(Date.now() + 60000),
      } as never);

      const result = await authService.verifyEmail('revoked-token');
      expect(result).toEqual({ stage: 'invalid', code: 'INVALID_VERIFICATION_TOKEN' });
    });

    it('returns expired stage when token has expired', async () => {
      mockAuthRepo.findVerificationTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        user_id: 'user-1',
        status: 'pending',
        expires_at: new Date(Date.now() - 10000),
      } as never);

      const result = await authService.verifyEmail('expired-token');
      expect(result).toEqual({ stage: 'expired', code: 'VERIFICATION_TOKEN_EXPIRED' });
    });

    it('activates user and marks token used when token is valid and pending', async () => {
      mockAuthRepo.findVerificationTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        user_id: 'user-1',
        status: 'pending',
        expires_at: new Date(Date.now() + 60000),
      } as never);
      mockAuthRepo.markTokenUsed = vi.fn().mockResolvedValue(undefined);
      mockUserService.markEmailVerified = vi.fn().mockResolvedValue({} as never);

      const result = await authService.verifyEmail('valid-token');
      expect(result).toEqual({ stage: 'success' });
      expect(mockAuthRepo.markTokenUsed).toHaveBeenCalledWith('token-1');
      expect(mockUserService.markEmailVerified).toHaveBeenCalledWith('user-1');
    });
  });

  describe('resendVerificationEmail', () => {
    it('returns generic success response without sending email if user not found', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue(null);

      const result = await authService.resendVerificationEmail({ email: 'unknown@example.com' });
      expect(result.success).toBe(true);
      expect(result.data.verificationEmailSent).toBe(true);
      expect(mockAuthRepo.createVerificationToken).not.toHaveBeenCalled();
    });

    it('returns generic success response without sending email if user is not inactive', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'active@example.com',
        status: 'active',
      } as never);

      const result = await authService.resendVerificationEmail({ email: 'active@example.com' });
      expect(result.success).toBe(true);
      expect(result.data.verificationEmailSent).toBe(true);
      expect(mockAuthRepo.createVerificationToken).not.toHaveBeenCalled();
    });

    it('revokes prior tokens and dispatches new verification email for inactive user', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'inactive@example.com',
        status: 'inactive',
      } as never);
      mockAuthRepo.revokePriorVerificationTokens = vi.fn().mockResolvedValue(undefined);
      mockAuthRepo.createVerificationToken = vi.fn().mockResolvedValue({} as never);

      const result = await authService.resendVerificationEmail({ email: 'inactive@example.com' });
      expect(result.success).toBe(true);
      expect(result.data.verificationEmailSent).toBe(true);
      expect(mockAuthRepo.revokePriorVerificationTokens).toHaveBeenCalledWith('user-1');
      expect(mockAuthRepo.createVerificationToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('returns generic success response without sending email if user not found', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue(null);

      const result = await authService.requestPasswordReset({ email: 'unknown@example.com' });
      expect(result.success).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it('returns generic success response without sending email if user is suspended', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'suspended@example.com',
        status: 'suspended',
      } as never);

      const result = await authService.requestPasswordReset({ email: 'suspended@example.com' });
      expect(result.success).toBe(true);
      expect(mockAuthRepo.createPasswordResetToken).not.toHaveBeenCalled();
    });

    it('revokes prior tokens, creates reset token, and sends email for active user', async () => {
      mockUserService.findByEmail = vi.fn().mockResolvedValue({
        _id: 'user-1',
        email: 'active@example.com',
        status: 'active',
      } as never);
      mockAuthRepo.revokePriorPasswordResetTokens = vi.fn().mockResolvedValue(undefined);
      mockAuthRepo.createPasswordResetToken = vi.fn().mockResolvedValue({} as never);

      const result = await authService.requestPasswordReset({ email: 'active@example.com' });
      expect(result.success).toBe(true);
      expect(mockAuthRepo.revokePriorPasswordResetTokens).toHaveBeenCalledWith('user-1');
      expect(mockAuthRepo.createPasswordResetToken).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          tokenHash: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      );
    });
  });

  describe('checkResetPasswordToken', () => {
    it('throws 404 when token is empty or invalid string', async () => {
      await expect(authService.checkResetPasswordToken('')).rejects.toMatchObject({
        statusCode: 404,
        code: 'INVALID_RESET_TOKEN',
      });
    });

    it('throws 404 when token is not found in repository', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue(null);

      await expect(authService.checkResetPasswordToken('unknown-token')).rejects.toMatchObject({
        statusCode: 404,
        code: 'INVALID_RESET_TOKEN',
      });
    });

    it('throws 410 when token is already used', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        status: 'used',
        expires_at: new Date(Date.now() + 60000),
      } as never);

      await expect(authService.checkResetPasswordToken('used-token')).rejects.toMatchObject({
        statusCode: 410,
        code: 'RESET_TOKEN_UNAVAILABLE',
      });
    });

    it('throws 410 when token has expired', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        status: 'pending',
        expires_at: new Date(Date.now() - 10000),
      } as never);

      await expect(authService.checkResetPasswordToken('expired-token')).rejects.toMatchObject({
        statusCode: 410,
        code: 'RESET_TOKEN_UNAVAILABLE',
      });
    });

    it('returns valid true when token is pending and unexpired', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        status: 'pending',
        expires_at: new Date(Date.now() + 60000),
      } as never);

      const result = await authService.checkResetPasswordToken('valid-token');
      expect(result).toEqual({ success: true, data: { valid: true } });
    });
  });

  describe('resetPassword', () => {
    it('throws 404 if token does not exist', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue(null);

      await expect(
        authService.resetPassword({ token: 'not-found', newPassword: 'newpassword123' }),
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'INVALID_RESET_TOKEN',
      });
    });

    it('throws 410 if token is used or expired', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        status: 'used',
        expires_at: new Date(Date.now() + 60000),
      } as never);

      await expect(
        authService.resetPassword({ token: 'used-token', newPassword: 'newpassword123' }),
      ).rejects.toMatchObject({
        statusCode: 410,
        code: 'RESET_TOKEN_UNAVAILABLE',
      });
    });

    it('updates password, activates inactive user, and marks token used', async () => {
      mockAuthRepo.findPasswordResetTokenByHash = vi.fn().mockResolvedValue({
        _id: 'token-1',
        user_id: 'user-1',
        status: 'pending',
        expires_at: new Date(Date.now() + 60000),
      } as never);
      mockAuthRepo.updateLocalAccountPassword = vi.fn().mockResolvedValue(undefined);
      mockAuthRepo.markTokenUsed = vi.fn().mockResolvedValue(undefined);
      mockUserService.findById = vi.fn().mockResolvedValue({
        _id: 'user-1',
        status: 'inactive',
      } as never);
      mockUserService.markEmailVerified = vi.fn().mockResolvedValue({} as never);

      const result = await authService.resetPassword({ token: 'valid-token', newPassword: 'newpassword123' });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.updateLocalAccountPassword).toHaveBeenCalledWith('user-1', expect.any(String));
      expect(mockUserService.markEmailVerified).toHaveBeenCalledWith('user-1');
      expect(mockAuthRepo.markTokenUsed).toHaveBeenCalledWith('token-1');
    });
  });

  describe('changePassword', () => {
    it('throws 400 if user account has no password hash', async () => {
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-1',
        user_id: 'user-1',
        provider: 'local',
      } as never);

      await expect(
        authService.changePassword('user-1', {
          currentPassword: 'currentPassword123',
          newPassword: 'newPassword123',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('throws 400 if currentPassword does not match', async () => {
      const passwordHash = await bcrypt.hash('differentPassword123', 10);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-1',
        user_id: 'user-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);

      await expect(
        authService.changePassword('user-1', {
          currentPassword: 'wrongPassword123',
          newPassword: 'newPassword123',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('hashes new password and updates local account password', async () => {
      const passwordHash = await bcrypt.hash('currentPassword123', 10);
      mockAuthRepo.findLocalAccountByUserId = vi.fn().mockResolvedValue({
        _id: 'account-1',
        user_id: 'user-1',
        provider: 'local',
        password_hash: passwordHash,
      } as never);
      mockAuthRepo.updateLocalAccountPassword = vi.fn().mockResolvedValue(undefined);

      const result = await authService.changePassword('user-1', {
        currentPassword: 'currentPassword123',
        newPassword: 'newPassword123',
      });

      expect(result.success).toBe(true);
      expect(mockAuthRepo.updateLocalAccountPassword).toHaveBeenCalledWith('user-1', expect.any(String));
    });
  });

  describe('blockExpiredUnverifiedUsers', () => {
    it('calculates cutoff based on EMAIL_VERIFICATION_WINDOW_MS and calls userService.blockExpiredInactiveUsers', async () => {
      const now = 1700000000000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      mockUserService.blockExpiredInactiveUsers = vi.fn().mockResolvedValue(5);

      const modifiedCount = await authService.blockExpiredUnverifiedUsers();

      const expectedCutoff = new Date(now - env.EMAIL_VERIFICATION_WINDOW_MS);
      expect(mockUserService.blockExpiredInactiveUsers).toHaveBeenCalledWith(expectedCutoff);
      expect(modifiedCount).toBe(5);
      vi.restoreAllMocks();
    });
  });

  describe('startAuthVerificationJob', () => {
    it('runs immediately, schedules interval, and clears interval when teardown is invoked', () => {
      vi.useFakeTimers();
      const blockSpy = vi.spyOn(authService, 'blockExpiredUnverifiedUsers').mockResolvedValue(0);

      const stopJob = authService.startAuthVerificationJob();

      expect(blockSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(env.AUTH_VERIFICATION_JOB_INTERVAL_MS);
      expect(blockSpy).toHaveBeenCalledTimes(2);

      stopJob();

      vi.advanceTimersByTime(env.AUTH_VERIFICATION_JOB_INTERVAL_MS * 2);
      expect(blockSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});


