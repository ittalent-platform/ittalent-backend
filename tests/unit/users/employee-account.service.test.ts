import { beforeEach, describe, expect, it, vi } from 'vitest';

import { USER_MESSAGES } from '../../../src/modules/users/users.constants.js';
import type { UsersRepository } from '../../../src/modules/users/users.repository.js';
import { UsersService } from '../../../src/modules/users/users.service.js';

describe('UsersService - Manage Employee Account (UC 10 - UC 16)', () => {
  let mockRepo: Partial<UsersRepository>;
  let service: UsersService;

  beforeEach(() => {
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

  describe('createEmployee (UC-10 / UC-EMP-01)', () => {
    it('creates an employee account successfully for a recruiter', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'recruiter-1') {
          return Promise.resolve({
            _id: 'recruiter-1',
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
        { id: 'recruiter-1', role: 'recruiter' },
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
        _id: 'recruiter-1',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);
      mockRepo.existsByEmail = vi.fn().mockResolvedValue(true);

      await expect(
        service.createEmployee(
          { id: 'recruiter-1', role: 'recruiter' },
          {
            fullName: 'Nguyen Van B',
            email: 'duplicate@company.com',
            role: 'recruiter',
          },
        ),
      ).rejects.toThrow(USER_MESSAGES.EMAIL_EXISTS);
    });

    it('prevents recruiter from creating a system admin account with 403 Forbidden', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'recruiter-1',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);

      await expect(
        service.createEmployee(
          { id: 'recruiter-1', role: 'recruiter' },
          {
            fullName: 'Malicious Admin',
            email: 'admin@company.com',
            role: 'admin',
          },
        ),
      ).rejects.toThrow(USER_MESSAGES.ADMIN_CREATE_RESTRICTED);
    });

    it('rejects recruiter without an enterprise affiliation with 400 Bad Request', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'recruiter-no-ent',
        enterprise_id: null,
      } as never);

      await expect(
        service.createEmployee(
          { id: 'recruiter-no-ent', role: 'recruiter' },
          {
            fullName: 'Nguyen Van C',
            email: 'staff@test.com',
            role: 'recruiter',
          },
        ),
      ).rejects.toThrow(USER_MESSAGES.NO_ENTERPRISE);
    });
  });

  describe('updateUser (UC-11 / UC-EMP-02)', () => {
    it('blocks self-role modification with 403 Forbidden (BR-EMP-07)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'user-self',
        role: 'recruiter',
        enterprise_id: '507f1f77bcf86cd799439011',
        toObject: () => ({ role: 'recruiter' }),
      } as never);

      await expect(
        service.updateUser({ id: 'user-self', role: 'recruiter' }, 'user-self', {
          role: 'admin',
        }),
      ).rejects.toThrow(USER_MESSAGES.SELF_ROLE_CHANGE);
    });

    it('blocks cross-tenancy updates for recruiter with 404 Not Found (BR-EMP-18)', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'recruiter-1') {
          return Promise.resolve({
            _id: 'recruiter-1',
            enterprise_id: '507f1f77bcf86cd799439011',
          } as never);
        }
        if (id === 'emp-other-tenant') {
          return Promise.resolve({
            _id: 'emp-other-tenant',
            enterprise_id: '507f1f77bcf86cd799439999',
            role: 'recruiter',
          } as never);
        }
        return Promise.resolve(null);
      });

      await expect(
        service.updateUser(
          { id: 'recruiter-1', role: 'recruiter' },
          'emp-other-tenant',
          { fullName: 'Updated Name' },
        ),
      ).rejects.toThrow(USER_MESSAGES.NOT_FOUND);
    });
  });

  describe('updateUserStatus (UC-12 / UC-EMP-03)', () => {
    it('updates status and records audit metadata', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'emp-target',
        status: 'active',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);

      const fakeUpdated = {
        _id: 'emp-target',
        email: 'emp@test.com',
        username: 'emptest',
        role: 'recruiter',
        status: 'suspended',
        toObject: () => ({
          _id: 'emp-target',
          email: 'emp@test.com',
          username: 'emptest',
          role: 'recruiter',
          status: 'suspended',
          status_reason: 'Violated corporate policy',
          status_updated_at: new Date('2026-10-11T12:00:00Z'),
          status_updated_by: 'admin-1',
          createdAt: new Date('2026-10-10T00:00:00Z'),
        }),
      };
      mockRepo.updateStatus = vi.fn().mockResolvedValue(fakeUpdated as never);

      const result = await service.updateUserStatus(
        { id: 'admin-1', role: 'admin' },
        'emp-target',
        { status: 'suspended', reason: 'Violated corporate policy' },
      );

      expect(result.status).toBe('suspended');
      expect(result.statusReason).toBe('Violated corporate policy');
      expect(result.statusUpdatedBy).toBe('admin-1');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(
        'emp-target',
        'suspended',
        'admin-1',
        'Violated corporate policy',
      );
    });

    it('prohibits self-suspension with 403 Forbidden (BR-EMP-10)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'admin-self',
        status: 'active',
      } as never);

      await expect(
        service.updateUserStatus(
          { id: 'admin-self', role: 'admin' },
          'admin-self',
          { status: 'suspended' },
        ),
      ).rejects.toThrow(USER_MESSAGES.SELF_SUSPENSION);
    });

    it('requires justification reason when suspending an account (BR-EMP-13)', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'emp-target',
        status: 'active',
      } as never);

      await expect(
        service.updateUserStatus(
          { id: 'admin-1', role: 'admin' },
          'emp-target',
          { status: 'suspended', reason: '' },
        ),
      ).rejects.toThrow(USER_MESSAGES.REASON_REQUIRED);
    });

    it('rejects invalid status transition (e.g. active to active) with 400 Bad Request', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'emp-target',
        status: 'active',
      } as never);

      await expect(
        service.updateUserStatus(
          { id: 'admin-1', role: 'admin' },
          'emp-target',
          { status: 'active' },
        ),
      ).rejects.toThrow(USER_MESSAGES.INVALID_STATUS_TRANSITION);
    });
  });

  describe('getUserById & Multi-Tenancy Scoping (UC-14 / UC-EMP-05)', () => {
    it('allows recruiter to view employee in the same enterprise', async () => {
      mockRepo.findById = vi.fn().mockImplementation((id: string) => {
        if (id === 'recruiter-1') {
          return Promise.resolve({
            _id: 'recruiter-1',
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

  describe('getUserHistory (UC-15 / UC-EMP-06)', () => {
    it('returns chronological history items including creation and multiple status transitions without data loss', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'emp-1',
        role: 'recruiter',
        status: 'suspended',
        toObject: () => ({
          _id: 'emp-1',
          role: 'recruiter',
          status: 'suspended',
          status_history: [
            {
              status: 'suspended',
              changed_at: new Date('2026-10-05T10:00:00Z'),
              changed_by: 'admin-1',
              reason: 'First suspension for investigation',
            },
            {
              status: 'active',
              changed_at: new Date('2026-10-08T09:00:00Z'),
              changed_by: 'admin-1',
              reason: 'Reinstated after review',
            },
            {
              status: 'suspended',
              changed_at: new Date('2026-10-11T14:00:00Z'),
              changed_by: 'admin-2',
              reason: 'Contract Ended',
            },
          ],
          createdAt: new Date('2026-10-01T08:00:00Z'),
          updatedAt: new Date('2026-10-11T14:00:00Z'),
        }),
      } as never);

      const history = await service.getUserHistory('emp-1', { id: 'admin-1', role: 'admin' });
      // 1 provision event + 3 status transitions + 1 profile updated = 5 events
      expect(history.items.length).toBe(5);

      // Verify newest transition appears first
      const statusTransitions = history.items.filter((item) => item.action.startsWith('Status Transition'));
      expect(statusTransitions.length).toBe(3);
      expect(statusTransitions[0]?.description).toContain('Contract Ended');
      expect(statusTransitions[1]?.description).toContain('Reinstated after review');
      expect(statusTransitions[2]?.description).toContain('First suspension for investigation');

      expect(history.items.some((item) => item.action === 'Account Provisioned')).toBe(true);
    });
  });

  describe('listUsers with Search & Multi-Tenancy (UC-13 & UC-16)', () => {
    it('applies recruiter enterprise_id filter automatically', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({
        _id: 'recruiter-1',
        enterprise_id: '507f1f77bcf86cd799439011',
      } as never);
      mockRepo.findPage = vi.fn().mockResolvedValue({ items: [], total: 0 });

      await service.listUsers(
        { page: 1, limit: 10, search: 'Nguyen', sortBy: 'createdAt', sortOrder: 'desc' },
        { id: 'recruiter-1', role: 'recruiter' },
      );

      expect(mockRepo.findPage).toHaveBeenCalledWith(
        expect.objectContaining({
          enterpriseId: '507f1f77bcf86cd799439011',
          search: 'Nguyen',
        }),
      );
    });
  });
});
