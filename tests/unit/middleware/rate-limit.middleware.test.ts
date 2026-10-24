import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changePasswordRateLimit,
  consumeVerificationAttemptRateLimit,
  createRateLimit,
  forgotPasswordRateLimit,
  getClientIp,
  resendVerificationEmailRateLimit,
  resetPasswordRateLimit,
  resetRateLimitMemory,
} from '../../../src/middleware/rate-limit.middleware.js';

function createMockReq(ip = '127.0.0.1', body: Record<string, unknown> = {}, userId?: string): Partial<Request> {
  return {
    ip,
    socket: { remoteAddress: ip } as unknown as Request['socket'],
    body,
    ...(userId ? { user: { id: userId, email: 'user@example.com', role: 'user', authVersion: 0 } } : {}),
  };
}

function createMockRes(statusCode = 200): {
  res: Partial<Response>;
  statusMock: ReturnType<typeof vi.fn>;
  jsonMock: ReturnType<typeof vi.fn>;
  triggerFinish: () => void;
} {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const finishListeners: Array<() => void> = [];

  return {
    res: {
      statusCode,
      status: statusMock,
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'finish') {
          finishListeners.push(listener);
        }
      }) as unknown as Response['on'],
    },
    statusMock,
    jsonMock,
    triggerFinish: () => {
      for (const listener of finishListeners) {
        listener();
      }
    },
  };
}

describe('RateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitMemory();
  });

  describe('getClientIp', () => {
    it('returns request IP if available', () => {
      const req = createMockReq('192.168.1.1');
      expect(getClientIp(req as Request)).toBe('192.168.1.1');
    });

    it('falls back to socket remoteAddress if req.ip is undefined', () => {
      const req = {
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as Request;
      expect(getClientIp(req)).toBe('10.0.0.1');
    });
  });

  describe('createRateLimit in memory mode', () => {
    it('allows requests within maxAttempts and blocks exceeding requests with 429', async () => {
      const customRateLimit = createRateLimit({
        prefix: 'test-limit',
        windowSeconds: 60,
        maxAttempts: 2,
        message: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
      });

      const next = vi.fn();
      const req = createMockReq('1.2.3.4') as Request;

      // 1st request -> allowed
      const { res: res1 } = createMockRes();
      await customRateLimit(req, res1 as Response, next);
      expect(next).toHaveBeenCalledTimes(1);

      // 2nd request -> allowed
      const { res: res2 } = createMockRes();
      await customRateLimit(req, res2 as Response, next);
      expect(next).toHaveBeenCalledTimes(2);

      // 3rd request -> rejected (429)
      const { res: res3, statusMock, jsonMock } = createMockRes();
      await customRateLimit(req, res3 as Response, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
      });
    });
  });

  describe('auth rate limiters definitions', () => {
    it('defines forgotPasswordRateLimit, resetPasswordRateLimit, resendVerificationEmailRateLimit, and changePasswordRateLimit as request handlers', () => {
      expect(typeof forgotPasswordRateLimit).toBe('function');
      expect(typeof resetPasswordRateLimit).toBe('function');
      expect(typeof resendVerificationEmailRateLimit).toBe('function');
      expect(typeof changePasswordRateLimit).toBe('function');
    });

    it('enforces changePasswordRateLimit after 5 failed attempts per userId and IP', async () => {
      const next = vi.fn();
      const req = createMockReq('10.10.10.10', {}, 'user-123') as Request;

      for (let i = 0; i < 5; i += 1) {
        const { res, triggerFinish } = createMockRes(400);
        await changePasswordRateLimit(req, res as Response, next);
        triggerFinish();
      }
      expect(next).toHaveBeenCalledTimes(5);

      const { res: blockedRes, statusMock, jsonMock } = createMockRes(429);
      await changePasswordRateLimit(req, blockedRes as Response, next);
      expect(next).toHaveBeenCalledTimes(5);
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        success: false,
        message: 'Too many password change attempts. Please try again later.',
        code: 'RATE_LIMITED',
      });
    });
  });

  describe('consumeVerificationAttemptRateLimit', () => {
    it('tracks attempts and flags allowed status', async () => {
      const req = createMockReq('5.6.7.8') as Request;
      const attempt1 = await consumeVerificationAttemptRateLimit(req);
      expect(attempt1.allowed).toBe(true);
      expect(attempt1.count).toBeGreaterThanOrEqual(1);
    });
  });
});
