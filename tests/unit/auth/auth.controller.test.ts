import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as rateLimitMiddleware from '../../../src/middleware/rate-limit.middleware.js';
import { AuthController, getEmailVerificationRedirectUrl } from '../../../src/modules/auth/auth.controller.js';
import type { AuthService } from '../../../src/modules/auth/auth.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

describe('AuthController', () => {
  let mockService: Partial<AuthService>;
  let controller: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = {
      register: vi.fn(),
      login: vi.fn(),
      refreshTokens: vi.fn(),
      getCurrentUser: vi.fn(),
      verifyEmail: vi.fn(),
      resendVerificationEmail: vi.fn(),
    };
    controller = new AuthController(mockService as AuthService);
  });

  describe('register', () => {
    it('returns 201 with auth payload', async () => {
      const mockResult = {
        user: { id: '1', email: 'test@example.com', username: 'testuser', role: 'user', status: 'active' },
        tokens: { accessToken: 'a', refreshToken: 'r' },
        verificationEmailSent: true,
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

  describe('verifyEmail', () => {
    it('redirects with stage=success on successful token verification', async () => {
      mockService.verifyEmail = vi.fn().mockResolvedValue({ stage: 'success' });
      const redirect = vi.fn();
      const req = { query: { token: 'valid-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(mockService.verifyEmail).toHaveBeenCalledWith('valid-token');
      expect(redirect).toHaveBeenCalledWith(
        HTTP_STATUS.HTTP_302_FOUND,
        expect.stringContaining('/verify-email?stage=success'),
      );
    });

    it('redirects with stage=already-verified and code on previously used token', async () => {
      mockService.verifyEmail = vi.fn().mockResolvedValue({
        stage: 'already-verified',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
      const redirect = vi.fn();
      const req = { query: { token: 'used-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(redirect).toHaveBeenCalledWith(
        HTTP_STATUS.HTTP_302_FOUND,
        expect.stringContaining('/verify-email?stage=already-verified&code=EMAIL_ALREADY_VERIFIED'),
      );
    });

    it('redirects with stage=invalid and code when token is invalid and rate limit allowed', async () => {
      mockService.verifyEmail = vi.fn().mockResolvedValue({
        stage: 'invalid',
        code: 'INVALID_VERIFICATION_TOKEN',
      });
      vi.spyOn(rateLimitMiddleware, 'consumeVerificationAttemptRateLimit').mockResolvedValue({
        allowed: true,
        count: 1,
        resetAt: Date.now() + 1000,
      });

      const redirect = vi.fn();
      const req = { query: { token: 'bad-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(redirect).toHaveBeenCalledWith(
        HTTP_STATUS.HTTP_302_FOUND,
        expect.stringContaining('/verify-email?stage=invalid&code=INVALID_VERIFICATION_TOKEN'),
      );
    });

    it('redirects with stage=retry-later and code=RATE_LIMITED when rate limit exceeded', async () => {
      mockService.verifyEmail = vi.fn().mockResolvedValue({
        stage: 'invalid',
        code: 'INVALID_VERIFICATION_TOKEN',
      });
      vi.spyOn(rateLimitMiddleware, 'consumeVerificationAttemptRateLimit').mockResolvedValue({
        allowed: false,
        count: 6,
        resetAt: Date.now() + 1000,
      });

      const redirect = vi.fn();
      const req = { query: { token: 'bad-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(redirect).toHaveBeenCalledWith(
        HTTP_STATUS.HTTP_302_FOUND,
        expect.stringContaining('/verify-email?stage=retry-later&code=RATE_LIMITED'),
      );
    });

    it('redirects with stage=expired and code=VERIFICATION_TOKEN_EXPIRED when token is expired', async () => {
      mockService.verifyEmail = vi.fn().mockResolvedValue({
        stage: 'expired',
        code: 'VERIFICATION_TOKEN_EXPIRED',
      });
      vi.spyOn(rateLimitMiddleware, 'consumeVerificationAttemptRateLimit').mockResolvedValue({
        allowed: true,
        count: 1,
        resetAt: Date.now() + 1000,
      });

      const redirect = vi.fn();
      const req = { query: { token: 'expired-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(redirect).toHaveBeenCalledWith(
        HTTP_STATUS.HTTP_302_FOUND,
        expect.stringContaining('/verify-email?stage=expired&code=VERIFICATION_TOKEN_EXPIRED'),
      );
    });

    it('passes unhandled error to next', async () => {
      const error = new Error('Database failure');
      mockService.verifyEmail = vi.fn().mockRejectedValue(error);

      const redirect = vi.fn();
      const req = { query: { token: 'err-token' } } as never;
      const res = { redirect, locals: {} } as never;
      const next = vi.fn();

      await controller.verifyEmail(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('resendVerificationEmail', () => {
    it('returns 200 with result payload from service', async () => {
      const mockResult = {
        success: true as const,
        message: 'If the email is registered and unverified, a verification email has been sent.',
        data: { verificationEmailSent: true },
      };
      mockService.resendVerificationEmail = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { email: 'user@example.com' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.resendVerificationEmail(req, res, next);

      expect(mockService.resendVerificationEmail).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('passes errors from resendVerificationEmail to next', async () => {
      const error = new Error('Service failure');
      mockService.resendVerificationEmail = vi.fn().mockRejectedValue(error);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { email: 'user@example.com' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.resendVerificationEmail(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getEmailVerificationRedirectUrl', () => {
    it('constructs correct redirect URL with query params', () => {
      const url = getEmailVerificationRedirectUrl('stage=already-verified&code=EMAIL_ALREADY_VERIFIED', {
        appBaseUrl: 'http://localhost:5173',
      });
      expect(url).toBe('http://localhost:5173/verify-email?stage=already-verified&code=EMAIL_ALREADY_VERIFIED');
    });

    it('handles query string without query prefix', () => {
      const url = getEmailVerificationRedirectUrl('stage=success', {
        appBaseUrl: 'http://localhost:5173/',
      });
      expect(url).toBe('http://localhost:5173/verify-email?stage=success');
    });

    it('handles empty query string', () => {
      const url = getEmailVerificationRedirectUrl('', {
        appBaseUrl: 'http://localhost:5173',
      });
      expect(url).toBe('http://localhost:5173/verify-email');
    });
  });
});
