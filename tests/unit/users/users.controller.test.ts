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
    };
    controller = new UsersController(mockService as UsersService);
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
      expect(json).toHaveBeenCalledWith(mockResult);
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
});
