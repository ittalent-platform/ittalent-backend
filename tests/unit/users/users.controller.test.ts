import { describe, expect, it, vi, beforeEach } from 'vitest';

import { UsersController } from '../../../src/modules/users/users.controller.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('UsersController', () => {
  let mockService: Partial<UsersService>;
  let controller: UsersController;

  beforeEach(() => {
    mockService = {
      getUserById: vi.fn(),
      listUsers: vi.fn(),
      listUsersWithAdminMetadata: vi.fn(),
      withAdminMetadata: vi.fn(),
      updateUser: vi.fn(),
      updateStatus: vi.fn(),
      emergencySuspend: vi.fn(),
      updateRole: vi.fn(),
    };
    controller = new UsersController(mockService as UsersService);
  });

  it.each([
    ['updateStatus', 'updateStatus', { status: 'suspended', reason: 'Policy violation', expectedVersion: 0 }],
    ['emergencySuspend', 'emergencySuspend', { reason: 'Suspected account compromise', expectedVersion: 0 }],
    ['updateRole', 'updateRole', { role: 'recruiter', reason: 'Role assignment update', expectedVersion: 0 }],
  ] as const)('delegates %s to UsersService with actor, target, and validated body', async (method, serviceMethod, body) => {
    const result = { id: 'target' };
    const call = vi.fn().mockResolvedValue(result);
    mockService[serviceMethod] = call as never;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const req = { user: { id: 'admin' } };
    const res = { status, locals: { validated: { params: { id: 'target' }, body } } };

    await controller[method](req as never, res as never, vi.fn());

    expect(call).toHaveBeenCalledWith('admin', 'target', body);
    expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
    expect(json).toHaveBeenCalledWith(result);
  });

  describe('updateUser', () => {
    it('passes the authenticated administrator and validated request to the service', async () => {
      const result = { id: 'target', fullName: 'Mai Dương' };
      mockService.updateUser = vi.fn().mockResolvedValue(result);
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const response = { status, locals: { validated: { params: { id: 'target' }, body: { fullName: 'Mai Dương' } } } } as never;

      await controller.updateUser({ user: { id: 'admin-user' } } as never, response, vi.fn());

      expect(mockService.updateUser).toHaveBeenCalledWith('admin-user', 'target', { fullName: 'Mai Dương' });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(result);
    });
  });

  describe('getUserById', () => {
    it('returns 200 with user data', async () => {
      const mockResult = {
        id: 'user-id-1',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user',
        status: 'active',
      };
      mockService.getUserById = vi.fn().mockResolvedValue(mockResult);
      mockService.withAdminMetadata = vi.fn().mockResolvedValue({ ...mockResult, enterpriseName: null, invitation: null });

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.getUserById(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith({ ...mockResult, enterpriseName: null, invitation: null });
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Not found');
      mockService.getUserById = vi.fn().mockRejectedValue(error);

      const status = vi.fn();
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.getUserById(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('listUsers', () => {
    it('returns 200 with the requested page', async () => {
      const page = { items: [], page: 1, limit: 20, total: 0, totalPages: 0 };
      mockService.listUsersWithAdminMetadata = vi.fn().mockResolvedValue(page);
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const query = { page: 1, limit: 20, search: 'ann' };
      const res = { status, locals: { validated: { query } } } as never;
      const next = vi.fn();

      await controller.listUsers({} as never, res, next);

      expect(mockService.listUsersWithAdminMetadata).toHaveBeenCalledWith(query);
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(page);
    });

    it('forwards errors to next', async () => {
      const error = new Error('down');
      mockService.listUsersWithAdminMetadata = vi.fn().mockRejectedValue(error);
      const res = { status: vi.fn().mockReturnValue({ json: vi.fn() }), locals: { validated: { query: { page: 1, limit: 20 } } } } as never;
      const next = vi.fn();

      await controller.listUsers({} as never, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
