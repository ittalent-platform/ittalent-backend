import { describe, expect, it, vi, beforeEach } from 'vitest';

import { createHttpError } from '../../../src/shared/errors/http-error.js';
import { UsersService } from '../../../src/modules/users/users.service.js';
import type { UsersRepository } from '../../../src/modules/users/users.repository.js';

describe('UsersService', () => {
  let mockRepo: Partial<UsersRepository>;
  let usersService: UsersService;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findByIdentifier: vi.fn(),
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      existsByEmail: vi.fn(),
      existsByUsername: vi.fn(),
      createUser: vi.fn(),
      findRecruitersByEnterpriseId: vi.fn(),
      findPage: vi.fn(),
    };
    usersService = new UsersService(mockRepo as UsersRepository);
  });

  describe('getUserById', () => {
    it('returns user DTO when user exists', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
        toObject: () => ({
          _id: 'user-id-1',
          email: 'test@example.com',
          username: 'testuser',
          role: 'user',
          status: 'active',
        }),
      });

      const result = await usersService.getUserById('user-id-1');

      expect(result.id).toBe('user-id-1');
      expect(result.email).toBe('test@example.com');
      expect(result.username).toBe('testuser');
      expect(result.enterpriseId).toBeNull();
    });

    it('throws 404 when user does not exist', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(usersService.getUserById('nonexistent-id')).rejects.toThrow('User not found');
    });
  });

  describe('findByIdentifier', () => {
    it('delegates to repository.findByIdentifier', async () => {
      const mockUser = { _id: '1', email: 'test@example.com', username: 'testuser' };
      mockRepo.findByIdentifier = vi.fn().mockResolvedValue(mockUser as never);

      const result = await usersService.findByIdentifier('testuser');

      expect(mockRepo.findByIdentifier).toHaveBeenCalledWith('testuser');
      expect(result).toBe(mockUser);
    });
  });

  describe('createUser', () => {
    it('delegates to repository.createUser', async () => {
      const input = { email: 'new@example.com', username: 'newuser' };
      const createdUser = { _id: 'new-id', ...input };
      mockRepo.createUser = vi.fn().mockResolvedValue(createdUser as never);

      const result = await usersService.createUser(input);

      expect(mockRepo.createUser).toHaveBeenCalledWith(input);
      expect(result).toBe(createdUser);
    });
  });

  describe('blockExpiredInactiveUsers', () => {
    it('delegates to repository.blockExpiredInactiveUsers', async () => {
      const cutoff = new Date('2026-01-01T00:00:00.000Z');
      mockRepo.blockExpiredInactiveUsers = vi.fn().mockResolvedValue(3);

      const count = await usersService.blockExpiredInactiveUsers(cutoff, ['admin']);

      expect(mockRepo.blockExpiredInactiveUsers).toHaveBeenCalledWith(cutoff, ['admin']);
      expect(count).toBe(3);
    });
  });

  it('returns the enterprise assigned to a recruiter', async () => {
    mockRepo.findById = vi.fn().mockResolvedValue({ enterprise_id: 'enterprise-id' });

    await expect(usersService.getEnterpriseId('user-id')).resolves.toBe('enterprise-id');
  });

  it('queries recruiters by enterprise_id', async () => {
    const recruiters = [{ _id: 'recruiter-id' }];
    mockRepo.findRecruitersByEnterpriseId = vi.fn().mockResolvedValue(recruiters);

    await expect(usersService.findRecruitersByEnterpriseId('enterprise-id')).resolves.toBe(recruiters);
    expect(mockRepo.findRecruitersByEnterpriseId).toHaveBeenCalledWith('enterprise-id');
  });

  describe('listUsers (UC-USER-01)', () => {
    const userDoc = (over: Record<string, unknown> = {}) => {
      const base = {
        _id: 'user-id-1',
        email: 'a@example.com',
        username: 'alice',
        role: 'user',
        status: 'active',
        enterprise_id: null,
        ...over,
      };
      return {
        ...base,
        toObject: () => ({ ...base, createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-02T00:00:00.000Z') }),
      };
    };

    it('maps a page to the administration DTO with page metadata', async () => {
      mockRepo.findPage = vi.fn().mockResolvedValue({ items: [userDoc()], total: 21 });

      const query = { page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' } as const;
      const result = await usersService.listUsers(query);

      expect(mockRepo.findPage).toHaveBeenCalledWith(query);
      expect(result).toEqual({
        items: [
          {
            id: 'user-id-1',
            email: 'a@example.com',
            username: 'alice',
            role: 'user',
            status: 'active',
            emailVerified: false,
            enterpriseId: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-02T00:00:00.000Z',
          },
        ],
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3,
      });
    });

    it('reports the stored email verification state', async () => {
      mockRepo.findPage = vi.fn().mockResolvedValue({
        items: [userDoc({ email_verified: true }), userDoc({ _id: 'user-id-2', email_verified: false }), userDoc({ _id: 'user-id-3' })],
        total: 3,
      });

      const result = await usersService.listUsers({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });

      // Accounts created before the field existed have no value and count as not verified.
      expect(result.items.map((item) => item.emailVerified)).toEqual([true, false, false]);
    });

    it('returns an empty page with zero pages when nothing matches (AC.1)', async () => {
      mockRepo.findPage = vi.fn().mockResolvedValue({ items: [], total: 0 });

      await expect(usersService.listUsers({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })).resolves.toEqual({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('never puts a credential field in the result even if the document carries one', async () => {
      mockRepo.findPage = vi
        .fn()
        .mockResolvedValue({ items: [userDoc({ password_hash: 'secret-hash', token: 'secret-token' })], total: 1 });

      const result = await usersService.listUsers({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });

      expect(JSON.stringify(result)).not.toMatch(/secret-hash|secret-token|password|token/);
    });

    it('reports a storage failure without internal details and logs it (EX.3)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRepo.findPage = vi.fn().mockRejectedValue(new Error('connection refused at 10.0.0.5:27017'));

      await expect(usersService.listUsers({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })).rejects.toMatchObject({
        statusCode: 503,
        message: 'Unable to load user accounts right now. Please try again later.',
      });
      expect(spy).toHaveBeenCalledWith('[users:store:error]', expect.any(Error));
      spy.mockRestore();
    });

    it('fails closed when a result cannot be reduced to the allowed shape (EX.4)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRepo.findPage = vi.fn().mockResolvedValue({ items: [userDoc({ email: undefined })], total: 1 });

      await expect(usersService.listUsers({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' })).rejects.toMatchObject({ statusCode: 500 });
      expect(spy).toHaveBeenCalledWith('[users:projection:error]', expect.anything());
      spy.mockRestore();
    });
  });

  describe('getUserById failures (UC-USER-02)', () => {
    it('reports a storage failure as 503 with a safe message (EX.4)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockRepo.findById = vi.fn().mockRejectedValue(new Error('socket hang up'));

      await expect(usersService.getUserById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 503 });
      spy.mockRestore();
    });

    it('keeps an existing HTTP error as is', async () => {
      mockRepo.findById = vi.fn().mockRejectedValue(createHttpError(418, 'teapot'));

      await expect(usersService.getUserById('507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 418 });
    });
  });
});
