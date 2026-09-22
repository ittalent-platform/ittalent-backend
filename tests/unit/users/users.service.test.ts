import { describe, expect, it, vi, beforeEach } from 'vitest';

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
});
