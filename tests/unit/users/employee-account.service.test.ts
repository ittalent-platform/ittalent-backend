import { beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

import { USER_MESSAGES } from '../../../src/modules/users/users.constants.js';
import type { UsersRepository } from '../../../src/modules/users/users.repository.js';
import { UsersService } from '../../../src/modules/users/users.service.js';

describe('UsersService - Manage Employee Account (UC 10 - UC 16)', () => {
  let mockRepo: Partial<UsersRepository>;
  let service: UsersService;

  beforeEach(() => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    } as never);
    mockRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      existsByEmail: vi.fn().mockResolvedValue(false),
      existsByUsername: vi.fn().mockResolvedValue(false),
      createUser: vi.fn(),
      updateProfile: vi.fn(),
      updateStatus: vi.fn(),
      findPage: vi.fn(),
    };
    service = new UsersService(mockRepo as UsersRepository);
  });

  it('rejects a recruiter update to any other user ID', async () => {
    const recruiterId = '507f1f77bcf86cd799439011';
    const targetId = '507f1f77bcf86cd799439099';
    const doc = (id: string) => ({
      _id: id, email: `${id}@example.test`, username: 'recruiter', role: 'recruiter', status: 'active',
      enterprise_id: '507f1f77bcf86cd799439012', version: 0,
      toObject: () => ({ _id: id, email: `${id}@example.test`, username: 'recruiter', role: 'recruiter', status: 'active', version: 0 }),
    });
    mockRepo.findById = vi.fn().mockResolvedValue(doc(recruiterId) as never);
    mockRepo.findByIdWithSession = vi.fn().mockImplementation(async (id: { toString(): string }) => doc(id.toString()) as never);
    await expect(service.updateUser({ id: recruiterId, role: 'recruiter' }, targetId, { fullName: 'Not mine', expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403 });
  });

  describe('createEmployee (UC-10 / UC-EMP-01)', () => {
    it('creates a recruiter account successfully for an enterprise admin', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'enterprise-admin-1') {
          return Promise.resolve({
            _id: 'enterprise-admin-1',
            role: 'enterprise_admin',
            status: 'active',
            enterprise_id: '507f1f77bcf86cd799439011',
          } as never);
        }
        return Promise.resolve(null);
      });

      const fakeCreated = {
        _id: 'new-emp-1',
        email: 'staff@company.com',
        username: 'staff',
        role: 'recruiter',
        status: 'active',
        enterprise_id: '507f1f77bcf86cd799439011',
        toObject: () => ({
          _id: 'new-emp-1',
          email: 'staff@company.com',
          username: 'staff',
          full_name: 'Nguyen Van B',
          phone: '0901234567',
          role: 'recruiter',
          status: 'active',
          email_verified: false,
          enterprise_id: '507f1f77bcf86cd799439011',
          createdAt: new Date('2026-10-10T00:00:00Z'),
          updatedAt: new Date('2026-10-10T00:00:00Z'),
        }),
      };
      mockRepo.createUser = vi.fn().mockResolvedValue(fakeCreated as never);

      const result = await service.createEmployee(
        { id: 'enterprise-admin-1', role: 'enterprise_admin' },
        {
          fullName: 'Nguyen Van B',
          email: 'staff@company.com',
          phone: '0901234567',
          role: 'recruiter',
        },
      );

      expect(result.id).toBe('new-emp-1');
      expect(result.email).toBe('staff@company.com');
      expect(result.enterpriseId).toBe('507f1f77bcf86cd799439011');
      expect(mockRepo.createUser).toHaveBeenCalled();
    });

    it('rejects duplicate email with 409 Conflict (BR-EMP-01)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'enterprise-admin-1', role: 'enterprise_admin', status: 'active',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);
      mockRepo.existsByEmail = vi.fn().mockResolvedValue(true);

      await expect(
        service.createEmployee(
          { id: 'enterprise-admin-1', role: 'enterprise_admin' },
          {
            fullName: 'Nguyen Van B',
            email: 'duplicate@company.com',
            role: 'recruiter',
          },
        ),
      ).rejects.toThrow(USER_MESSAGES.EMAIL_EXISTS);
    });

    it('prevents enterprise admin from creating a system admin account with 403 Forbidden', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'enterprise-admin-1',
        role: 'enterprise_admin',
        status: 'active',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);

      await expect(
        service.createEmployee(
          { id: 'enterprise-admin-1', role: 'enterprise_admin' },
          {
            fullName: 'Malicious Admin',
            email: 'admin@company.com',
            role: 'admin',
          } as never,
        ),
      ).rejects.toThrow(USER_MESSAGES.ADMIN_CREATE_RESTRICTED);
    });

    it('rejects enterprise admin without an enterprise affiliation with 400 Bad Request', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'enterprise-admin-no-ent', role: 'enterprise_admin', status: 'active',
        enterprise_id: null,
      } as never);

      await expect(
        service.createEmployee(
          { id: 'enterprise-admin-no-ent', role: 'enterprise_admin' },
          {
            fullName: 'Nguyen Van C',
            email: 'staff@test.com',
            role: 'recruiter',
          },
        ),
      ).rejects.toThrow(USER_MESSAGES.NO_ENTERPRISE);
    });
  });

  describe('getUserById & Multi-Tenancy Scoping (UC-14 / UC-EMP-05)', () => {
    it('allows recruiter to view employee in the same enterprise', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'recruiter-1') {
          return Promise.resolve({
            _id: 'recruiter-1',
            role: 'recruiter',
            status: 'active',
            enterprise_id: '507f1f77bcf86cd799439011',
          } as never);
        }
        if (id === 'emp-same-tenant') {
          return Promise.resolve({
            _id: 'emp-same-tenant',
            email: 'peer@company.com',
            username: 'peer',
            role: 'recruiter',
            status: 'active',
            enterprise_id: '507f1f77bcf86cd799439011',
            toObject: () => ({
              _id: 'emp-same-tenant',
              email: 'peer@company.com',
              username: 'peer',
              role: 'recruiter',
              status: 'active',
              enterprise_id: '507f1f77bcf86cd799439011',
            }),
          } as never);
        }
        return Promise.resolve(null);
      });

      const result = await service.getUserById('emp-same-tenant', {
        id: 'recruiter-1',
        role: 'recruiter',
      });
      expect(result.id).toBe('emp-same-tenant');
      expect(result.email).toBe('peer@company.com');
    });

    it('returns 404 when recruiter attempts to inspect an employee from another enterprise (BR-EMP-18)', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'recruiter-1') {
          return Promise.resolve({
            _id: 'recruiter-1',
            role: 'recruiter',
            status: 'active',
            enterprise_id: '507f1f77bcf86cd799439011',
          } as never);
        }
        if (id === 'emp-foreign-tenant') {
          return Promise.resolve({
            _id: 'emp-foreign-tenant',
            enterprise_id: '507f1f77bcf86cd799439888',
          } as never);
        }
        return Promise.resolve(null);
      });

      await expect(
        service.getUserById('emp-foreign-tenant', {
          id: 'recruiter-1',
          role: 'recruiter',
        }),
      ).rejects.toThrow(USER_MESSAGES.NOT_FOUND);
    });
  });

  describe('listUsers with Search & Multi-Tenancy (UC-13 & UC-16)', () => {
    it('applies recruiter enterprise_id filter automatically', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'recruiter-1',
        role: 'recruiter',
        status: 'active',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);
      mockRepo.findPage = vi.fn().mockResolvedValue({ items: [], total: 0 });

      await service.listUsers(
        { page: 1, limit: 10, search: 'Nguyen', sortBy: 'createdAt', sortOrder: 'desc' },
        { id: 'recruiter-1', role: 'recruiter' },
      );

      expect(mockRepo.findPage).toHaveBeenCalledWith(
        expect.objectContaining({
          enterpriseId: ['507f1f77bcf86cd799439011'],
          search: 'Nguyen',
        }),
      );
    });
  });
});
