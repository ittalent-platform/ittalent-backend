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
    };
    mockUserService = {
      existsByEmail: vi.fn(),
      existsByUsername: vi.fn(),
      createUser: vi.fn(),
      findByIdentifier: vi.fn(),
      findById: vi.fn(),
      getUserById: vi.fn(),
      mapUserDto: vi.fn((user) => ({
        id: String(user._id),
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
      })),
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
        status: 'active',
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
      });
      expect(mockAuthRepo.createAccount).toHaveBeenCalled();
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.username).toBe('testuser');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
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
});
