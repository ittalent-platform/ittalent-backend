import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import { authenticate, authorize, requireVerifiedActiveUser } from '../../../src/middleware/auth.middleware.js';
import { env } from '../../../src/config/env.js';
import { User } from '../../../src/models/user.model.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('auth middleware', () => {
  afterEach(() => vi.restoreAllMocks());
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
        authVersion: 0,
      });
    });

    it('attaches user when token is supplied in query parameters', () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', role: 'user' },
        env.JWT_ACCESS_SECRET,
      );
      const req = {
        headers: {},
        query: { token },
      } as never;
      const res = {} as never;
      const next = vi.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect((req as { user?: unknown }).user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        authVersion: 0,
      });
    });

    it('retains the current session epoch from the signed token', () => {
      const token = jwt.sign({ sub: 'user-123', email: 'test@example.com', role: 'user', av: 3 }, env.JWT_ACCESS_SECRET);
      const req = { headers: { authorization: `Bearer ${token}` } } as never;
      const next = vi.fn();
      authenticate(req, {} as never, next);
      expect((req as { user?: { authVersion?: number } }).user?.authVersion).toBe(3);
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

    it('allows enterprise administrators through a shared job-manager guard', () => {
      const req = {
        user: {
          id: 'user-1',
          email: 'enterprise-admin@example.com',
          role: 'enterprise_admin',
        },
      } as never;
      const res = {} as never;
      const next = vi.fn();

      authorize('recruiter', 'enterprise_admin')(req, res, next);

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

  describe('requireVerifiedActiveUser', () => {
    function persistedUser(value: Record<string, unknown>): void {
      vi.spyOn(User, 'findById').mockReturnValue({
        select: () => ({ lean: () => ({ exec: async () => value }) }),
      } as never);
    }

    it('rechecks persisted verified Active state and allows a current session', async () => {
      persistedUser({ email: 'user@example.com', role: 'user', status: 'active', email_verified: true, auth_version: 2 });
      const req = { user: { id: 'user-1', email: 'old@example.com', role: 'user', authVersion: 2 } } as never;
      const next = vi.fn();
      await requireVerifiedActiveUser(req, {} as never, next);
      expect(next).toHaveBeenCalledWith();
      expect((req as { user: { emailVerified?: boolean } }).user.emailVerified).toBe(true);
    });

    it.each([
      [{ email: 'u@example.com', role: 'user', status: 'inactive', email_verified: false, auth_version: 0 }, 'EMAIL_NOT_VERIFIED'],
      [{ email: 'u@example.com', role: 'user', status: 'suspended', email_verified: true, auth_version: 0 }, 'ACCOUNT_SUSPENDED'],
      [{ email: 'u@example.com', role: 'user', status: 'blocked', email_verified: true, auth_version: 0 }, 'ACCOUNT_BLOCKED'],
    ])('denies persisted state with stable code', async (persisted, code) => {
      persistedUser(persisted);
      const req = { user: { id: 'user-1', email: 'u@example.com', role: 'user', authVersion: 0 } } as never;
      const next = vi.fn();
      await requireVerifiedActiveUser(req, {} as never, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code }));
    });

    it('rejects a role or auth-version change as a revoked session', async () => {
      persistedUser({ email: 'u@example.com', role: 'recruiter', status: 'active', email_verified: true, auth_version: 3 });
      const req = { user: { id: 'user-1', email: 'u@example.com', role: 'user', authVersion: 0 } } as never;
      const next = vi.fn();
      await requireVerifiedActiveUser(req, {} as never, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'SESSION_REVOKED' }));
    });
  });
});
