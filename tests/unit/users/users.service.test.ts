import { describe, expect, it, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { Types } from 'mongoose';

import { createHttpError } from '../../../src/shared/errors/http-error.js';
import { UsersService } from '../../../src/modules/users/users.service.js';
import type { UsersRepository } from '../../../src/modules/users/users.repository.js';
import type { UserAuditsService } from '../../../src/modules/user-audits/user-audits.service.js';
import type { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';

describe('UsersService', () => {
  let mockRepo: Partial<UsersRepository>;
  let mockAudits: Partial<UserAuditsService>;
  let mockNotifications: { dispatch: ReturnType<typeof vi.fn> };
  let usersService: UsersService;

  beforeEach(() => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue({
      withTransaction: async (callback: () => Promise<void>) => callback(),
      endSession: async () => undefined,
    } as never);
    mockRepo = {
      findById: vi.fn(),
      findByIdWithSession: vi.fn(),
      findByIdentifier: vi.fn(),
      findByEmail: vi.fn(),
      findByUsername: vi.fn(),
      existsByEmail: vi.fn(),
      existsByUsername: vi.fn(),
      createUser: vi.fn(),
      findRecruitersByEnterpriseId: vi.fn(),
      findPage: vi.fn(),
      updateProfile: vi.fn(),
      updateProfileVersioned: vi.fn(),
      findByIds: vi.fn(),
      findNamesByIds: vi.fn(),
      findIdsByKeyword: vi.fn(),
    };
    mockAudits = { record: vi.fn() };
    mockNotifications = { dispatch: vi.fn().mockResolvedValue({ id: 'noti-123' }) };
    usersService = new UsersService(
      mockRepo as UsersRepository,
      mockAudits as UserAuditsService,
      undefined,
      undefined,
      mockNotifications as unknown as NotificationsService,
    );
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
            fullName: null,
            phone: null,
            role: 'user',
            status: 'active',
            emailVerified: false,
            enterpriseId: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-02T00:00:00.000Z',
            version: 0,
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

  describe('lookups for other modules', () => {
    it('reads several users by id through the repository', async () => {
      const rows = [{ _id: 'u1' }, { _id: 'u2' }];
      mockRepo.findByIds = vi.fn().mockResolvedValue(rows);

      await expect(usersService.findByIds(['u1', 'u2'])).resolves.toBe(rows);
      expect(mockRepo.findByIds).toHaveBeenCalledWith(['u1', 'u2']);
    });

    it('finds user ids by keyword through the repository', async () => {
      mockRepo.findIdsByKeyword = vi.fn().mockResolvedValue(['u1']);

      await expect(usersService.findIdsByKeyword('mai', 50)).resolves.toEqual(['u1']);
      expect(mockRepo.findIdsByKeyword).toHaveBeenCalledWith('mai', 50);
    });
  });

  describe('findNamesByIds', () => {
    it('delegates actor-name projection to the users repository', async () => {
      const names = new Map([['u1', 'User One']]);
      mockRepo.findNamesByIds = vi.fn().mockResolvedValue(names);

      await expect(usersService.findNamesByIds(['u1'])).resolves.toBe(names);
      expect(mockRepo.findNamesByIds).toHaveBeenCalledWith(['u1']);
    });
  });

  it('delegates enterprise admin mutation locking to the enterprise service boundary', async () => {
    const lock = vi.fn().mockResolvedValue(true);
    const service = new UsersService(mockRepo as UsersRepository, mockAudits as UserAuditsService, undefined, lock);
    const enterpriseId = new Types.ObjectId();
    const session = {} as never;

    await expect(service.lockEnterpriseAdminChanges(enterpriseId, session)).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith(enterpriseId, session);
  });

  describe('admin metadata orchestration', () => {
    it('uses service resolvers for one user and a page without controller-owned joins', async () => {
      const resolver = {
        resolve: vi.fn().mockResolvedValue({ enterpriseName: 'Acme', invitation: null }),
        resolveMany: vi.fn().mockResolvedValue(new Map([['u1', { enterpriseName: 'Acme', invitation: null }]])),
      };
      const service = new UsersService(mockRepo as UsersRepository, mockAudits as UserAuditsService, resolver);
      const user = { id: 'u1', enterpriseId: 'e1' } as never;
      const query = { page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' } as const;
      vi.spyOn(service, 'getUserById').mockResolvedValue(user);
      vi.spyOn(service, 'listUsers').mockResolvedValue({ items: [user], page: 1, limit: 10, total: 1, totalPages: 1 });

      await expect(service.withAdminMetadata(user)).resolves.toMatchObject({ enterpriseName: 'Acme' });
      await expect(service.listUsersWithAdminMetadata(query)).resolves.toMatchObject({ items: [{ enterpriseName: 'Acme' }] });
      expect(resolver.resolve).toHaveBeenCalledWith('u1', 'e1');
      expect(resolver.resolveMany).toHaveBeenCalledWith([{ id: 'u1', enterpriseId: 'e1' }]);
    });
  });

  describe('new administrator transitions', () => {
    it('updates status in the transaction and writes an audit event', async () => {
      const actorId = new Types.ObjectId();
      const targetId = new Types.ObjectId();
      const doc = (id: Types.ObjectId, role: string, status: string, version: number) => ({
        _id: id, email: `${id}@example.test`, username: `user_${id}`, role, status, version,
        toObject: () => ({ _id: id, email: `${id}@example.test`, username: `user_${id}`, role, status, version }),
      });
      mockRepo.findByIdWithSession = vi.fn().mockResolvedValueOnce(doc(actorId, 'admin', 'active', 0)).mockResolvedValueOnce(doc(targetId, 'user', 'active', 0));
      mockRepo.transitionStatus = vi.fn().mockResolvedValue(doc(targetId, 'user', 'suspended', 1));
      mockAudits.record = vi.fn().mockResolvedValue(undefined);

      await expect(usersService.updateStatus(String(actorId), String(targetId), { status: 'suspended', reason: 'Policy violation', expectedVersion: 0 })).resolves.toMatchObject({ status: 'suspended', version: 1 });
      expect(mockRepo.transitionStatus).toHaveBeenCalledWith(String(targetId), 0, 'suspended', expect.anything());
      expect(mockAudits.record).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: targetId, actorId, action: 'status_suspended', reason: 'Policy violation', version: 1 }), expect.anything());
    });

    it('allows emergency suspension of the last Enterprise Administrator and audits the override', async () => {
      const actorId = new Types.ObjectId();
      const targetId = new Types.ObjectId();
      const enterpriseId = new Types.ObjectId();
      const doc = (id: Types.ObjectId, role: string, status: string, version: number) => {
        const value = { _id: id, email: `${id}@example.test`, username: `user_${id}`, role, status, email_verified: true, enterprise_id: enterpriseId, version };
        return { ...value, toObject: () => value };
      };
      const lock = vi.fn().mockResolvedValue(true);
      const service = new UsersService(
        mockRepo as UsersRepository,
        mockAudits as UserAuditsService,
        undefined,
        lock,
        mockNotifications as unknown as NotificationsService,
      );
      mockRepo.findById = vi.fn().mockResolvedValue(doc(targetId, 'enterprise_admin', 'active', 0));
      mockRepo.findByIdWithSession = vi.fn().mockResolvedValueOnce(doc(actorId, 'admin', 'active', 0)).mockResolvedValueOnce(doc(targetId, 'enterprise_admin', 'active', 0));
      mockRepo.countActiveEnterpriseAdmins = vi.fn().mockResolvedValue(1);
      mockRepo.transitionStatus = vi.fn().mockResolvedValue(doc(targetId, 'enterprise_admin', 'suspended', 1));
      mockAudits.record = vi.fn().mockResolvedValue(undefined);

      await expect(service.emergencySuspend(String(actorId), String(targetId), { reason: 'Suspected account compromise', expectedVersion: 0 })).resolves.toMatchObject({ status: 'suspended' });
      expect(lock).toHaveBeenCalledWith(enterpriseId, expect.anything());
      expect(mockRepo.countActiveEnterpriseAdmins).toHaveBeenCalledWith(enterpriseId, expect.anything());
      expect(mockAudits.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'status_suspended', changes: { emergency: 'true' } }), expect.anything());
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: String(targetId),
          type: 'account_alert',
          category: 'warning',
          title: 'Account Suspended',
        }),
      );
    });

    it('updates role using an enterprise-scoped lock and audits the transition', async () => {
      const actorId = new Types.ObjectId();
      const targetId = new Types.ObjectId();
      const enterpriseId = new Types.ObjectId();
      const doc = (id: Types.ObjectId, role: string, version: number) => ({
        _id: id, email: `${id}@example.test`, username: `user_${id}`, role, status: 'active', enterprise_id: enterpriseId, version,
        toObject: () => ({ _id: id, email: `${id}@example.test`, username: `user_${id}`, role, status: 'active', enterprise_id: enterpriseId, version }),
      });
      const lock = vi.fn().mockResolvedValue(true);
      const service = new UsersService(
        mockRepo as UsersRepository,
        mockAudits as UserAuditsService,
        undefined,
        lock,
        mockNotifications as unknown as NotificationsService,
      );
      mockRepo.findByIdWithSession = vi.fn().mockResolvedValueOnce(doc(actorId, 'admin', 0)).mockResolvedValueOnce(doc(targetId, 'recruiter', 0));
      mockRepo.transitionRole = vi.fn().mockResolvedValue(doc(targetId, 'enterprise_admin', 1));
      mockAudits.record = vi.fn().mockResolvedValue(undefined);

      await expect(service.updateRole(String(actorId), String(targetId), { role: 'enterprise_admin', reason: 'Assigned company admin', expectedVersion: 0 })).resolves.toMatchObject({ role: 'enterprise_admin', version: 1 });
      expect(lock).toHaveBeenCalledWith(enterpriseId, expect.anything());
      expect(mockAudits.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'role_changed', changes: { previousRole: 'recruiter', role: 'enterprise_admin' } }), expect.anything());
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: String(targetId),
          type: 'account_alert',
          category: 'info',
          title: 'Role Updated',
        }),
      );
    });
  });

  describe('updateUser', () => {
    const userDoc = (overrides: Record<string, unknown> = {}) => {
      const base = { _id: new Types.ObjectId(), email: 'target@example.test', username: 'target', role: 'user', status: 'active', version: 0, ...overrides };
      return { ...base, toObject: () => base };
    };

    it('updates an account and returns the projected full name and phone', async () => {
      const targetId = String(new Types.ObjectId());
      mockRepo.findById = vi.fn().mockResolvedValue(userDoc({ _id: new Types.ObjectId(targetId) }));
      mockRepo.findByIdWithSession = vi.fn().mockResolvedValue(userDoc({ _id: new Types.ObjectId(), role: 'admin', status: 'active' }));
      mockRepo.updateProfileVersioned = vi.fn().mockResolvedValue(userDoc({ full_name: 'Mai Dương', phone: '0901122334', version: 1 }));
      mockAudits.record = vi.fn().mockResolvedValue(undefined);

      await expect(usersService.updateUser(String(new Types.ObjectId()), targetId, { fullName: 'Mai Dương', phone: '0901122334', expectedVersion: 0 })).resolves.toMatchObject({ fullName: 'Mai Dương', phone: '0901122334' });
    });
  });
});
