import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import { authenticate, authorize } from '../../../src/middleware/auth.middleware.js';
import { env } from '../../../src/config/env.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('auth middleware', () => {
  describe('authenticate', () => {
    it('returns 401 when Authorization header is missing', () => {
      const req = { headers: {} } as never;
      const res = {} as never;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
        }),
      );
    });

    it('attaches user when token is valid', () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'user' },
        env.JWT_ACCESS_SECRET,
      );
      const req = {
        headers: { authorization: `Bearer ${token}` },
      } as never;
      const res = {} as never;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as { user?: unknown }).user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
      });
    });
  });

  describe('authorize', () => {
    it('allows request when user role matches', () => {
      const req = { user: { id: 'user-1', email: 'admin@example.com', role: 'admin' } } as never;
      const res = {} as never;
      const next = vi.fn();

      authorize('admin')(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('returns 403 when user role does not match', () => {
      const req = { user: { id: 'user-1', email: 'user@example.com', role: 'user' } } as never;
      const res = {} as never;
      const next = vi.fn();

      authorize('admin')(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_403_FORBIDDEN,
        }),
      );
    });
  });
});
