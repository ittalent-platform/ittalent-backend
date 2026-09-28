import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as rateLimitMiddleware from '../../../src/middleware/rate-limit.middleware.js';
import {
  AuthController,
  getEmailVerificationRedirectUrl,
  getResetPasswordRedirectUrl,
} from '../../../src/modules/auth/auth.controller.js';
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
      requestPasswordReset: vi.fn(),
      checkResetPasswordToken: vi.fn(),
      resetPassword: vi.fn(),
      changePassword: vi.fn(),
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

  describe('forgotPassword', () => {
    it('returns 200 with result payload from service', async () => {
      const mockResult = {
        success: true as const,
        message: 'If the email exists, a password reset link has been sent.',
        data: {},
      };
      mockService.requestPasswordReset = vi.fn().mockResolvedValue(mockResult);

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

      await controller.forgotPassword(req, res, next);

      expect(mockService.requestPasswordReset).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('passes errors from forgotPassword to next', async () => {
      const error = new Error('Service error');
      mockService.requestPasswordReset = vi.fn().mockRejectedValue(error);

      const req = {} as never;
      const res = {
        locals: {
          validated: {
            body: { email: 'user@example.com' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.forgotPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('checkResetPasswordToken', () => {
    it('returns 200 with valid result from service', async () => {
      const mockResult = {
        success: true,
        data: { valid: true },
      };
      mockService.checkResetPasswordToken = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = { query: { token: 'reset-token-123' } } as never;
      const res = {
        status,
        locals: {
          validated: {
            query: { token: 'reset-token-123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.checkResetPasswordToken(req, res, next);

      expect(mockService.checkResetPasswordToken).toHaveBeenCalledWith('reset-token-123');
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('passes errors from checkResetPasswordToken to next', async () => {
      const error = new Error('Token expired');
      mockService.checkResetPasswordToken = vi.fn().mockRejectedValue(error);

      const req = { query: {} } as never;
      const res = {
        locals: {},
      } as never;
      const next = vi.fn();

      await controller.checkResetPasswordToken(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('resetPassword', () => {
    it('returns 200 with result payload from service', async () => {
      const mockResult = {
        success: true as const,
        message: 'Password reset successful. You can now log in with your new password.',
        data: {},
      };
      mockService.resetPassword = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {} as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { token: 'valid-token', newPassword: 'newPassword123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.resetPassword(req, res, next);

      expect(mockService.resetPassword).toHaveBeenCalledWith({
        token: 'valid-token',
        newPassword: 'newPassword123',
      });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('passes errors from resetPassword to next', async () => {
      const error = new Error('Reset failed');
      mockService.resetPassword = vi.fn().mockRejectedValue(error);

      const req = {} as never;
      const res = {
        locals: {
          validated: {
            body: { token: 'valid-token', newPassword: 'newPassword123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.resetPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('changePassword', () => {
    it('returns 200 with result payload when authenticated', async () => {
      const mockResult = {
        success: true as const,
        message: 'Password changed successfully.',
        data: {},
      };
      mockService.changePassword = vi.fn().mockResolvedValue(mockResult);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = { user: { id: 'user-id-123' } } as never;
      const res = {
        status,
        locals: {
          validated: {
            body: { currentPassword: 'oldPassword123', newPassword: 'newPassword123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.changePassword(req, res, next);

      expect(mockService.changePassword).toHaveBeenCalledWith('user-id-123', {
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      });
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockResult);
    });

    it('passes 401 error to next if user is not attached to request', async () => {
      const req = {} as never;
      const res = { locals: {} } as never;
      const next = vi.fn();

      await controller.changePassword(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED,
        }),
      );
    });

    it('passes errors from service to next', async () => {
      const error = new Error('Change password failed');
      mockService.changePassword = vi.fn().mockRejectedValue(error);

      const req = { user: { id: 'user-id-123' } } as never;
      const res = {
        locals: {
          validated: {
            body: { currentPassword: 'oldPassword123', newPassword: 'newPassword123' },
          },
        },
      } as never;
      const next = vi.fn();

      await controller.changePassword(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getResetPasswordRedirectUrl', () => {
    it('constructs correct redirect URL with query params', () => {
      const url = getResetPasswordRedirectUrl('token=abc123&email=user%40example.com', {
        appBaseUrl: 'http://localhost:5173',
      });
      expect(url).toBe('http://localhost:5173/reset-password?token=abc123&email=user%40example.com');
    });

    it('handles query string without prefix', () => {
      const url = getResetPasswordRedirectUrl('token=xyz789', {
        appBaseUrl: 'http://localhost:5173/',
      });
      expect(url).toBe('http://localhost:5173/reset-password?token=xyz789');
    });

    it('handles empty query string', () => {
      const url = getResetPasswordRedirectUrl('', {
        appBaseUrl: 'http://localhost:5173',
      });
      expect(url).toBe('http://localhost:5173/reset-password');
    });
  });
});
