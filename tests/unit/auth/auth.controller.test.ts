import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AuthController } from '../../../src/modules/auth/auth.controller.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('AuthController', () => {
  let mockService: Partial<AuthService>;
  let controller: AuthController;

  beforeEach(() => {
    mockService = {
      register: vi.fn(),
      login: vi.fn(),
      refreshTokens: vi.fn(),
      getCurrentUser: vi.fn(),
    };
    controller = new AuthController(mockService as AuthService);
  });

  describe('register', () => {
    it('returns 201 with auth payload', async () => {
      const mockResult = {
        user: { id: '1', email: 'test@example.com', username: 'testuser', role: 'user', status: 'active' },
        tokens: { accessToken: 'a', refreshToken: 'r' },
      };
      mockService.register = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { email: 'test@example.com', password: 'password123', username: 'testuser' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.register(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(json).toHaveBeenCalledWith(mockResult);
    });
  });

  describe('login', () => {
    it('returns 200 with auth payload', async () => {
      const mockResult = {
        user: { id: '1', email: 'test@example.com', username: 'testuser', role: 'user', status: 'active' },
        tokens: { accessToken: 'a', refreshToken: 'r' },
      };
      mockService.login = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { identifier: 'test@example.com', password: 'password123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.login(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });
  });
});
