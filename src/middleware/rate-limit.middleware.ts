import type { RequestHandler } from 'express';

import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { TIME_MS } from '../shared/constants/time.js';

type RateLimitOptions = {
  prefix: string;
  windowSeconds: number;
  maxAttempts: number;
  message: string;
  code?: string;
  getBucketKey?: (req: Parameters<RequestHandler>[0]) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
};

type RateLimitAttemptResult = {
  allowed: boolean;
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateLimitMemory(): void {
  memoryBuckets.clear();
}

export function getClientIp(req: Parameters<RequestHandler>[0]): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function reject(res: Parameters<RequestHandler>[1], message: string, code?: string): void {
  res.status(HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS).json({
    success: false,
    message,
    ...(code ? { code } : {}),
  });
}

function decrementMemoryCount(key: string): void {
  const bucket = memoryBuckets.get(key);
  if (bucket) {
    bucket.count = Math.max(0, bucket.count - 1);
  }
}

function memoryRateLimit(key: string, windowMs: number, maxAttempts: number): RateLimitAttemptResult {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, count: 1, resetAt };
  }

  bucket.count += 1;

  return {
    allowed: bucket.count <= maxAttempts,
    count: bucket.count,
    resetAt: bucket.resetAt,
  };
}

async function redisRateLimit(key: string, windowSeconds: number, maxAttempts: number): Promise<RateLimitAttemptResult> {
  const redis = await getRedis();
  const now = Date.now();

  if (!redis) {
    return memoryRateLimit(key, windowSeconds * TIME_MS.ONE_SECOND, maxAttempts);
  }

  const redisKey = `rate-limit:${key}`;
  const count = await redis.incr(redisKey);

  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }

  return {
    allowed: count <= maxAttempts,
    count,
    resetAt: now + windowSeconds * TIME_MS.ONE_SECOND,
  };
}

export async function consumeRateLimitAttempt(
  {
    prefix,
    windowSeconds,
    maxAttempts,
    getBucketKey = getClientIp,
  }: Pick<RateLimitOptions, 'prefix' | 'windowSeconds' | 'maxAttempts' | 'getBucketKey'>,
  req: Parameters<RequestHandler>[0],
): Promise<RateLimitAttemptResult> {
  const key = `${prefix}:${getBucketKey(req)}`;
  return redisRateLimit(key, windowSeconds, maxAttempts);
}

export function createRateLimit({
  prefix,
  windowSeconds,
  maxAttempts,
  message,
  code,
  getBucketKey = getClientIp,
  skipFailedRequests = false,
  skipSuccessfulRequests = false,
}: RateLimitOptions): RequestHandler {
  return async (req, res, next) => {
    const key = `${prefix}:${getBucketKey(req)}`;
    const redis = await getRedis();

    if (!redis) {
      const attempt = memoryRateLimit(key, windowSeconds * TIME_MS.ONE_SECOND, maxAttempts);

      if (!attempt.allowed) {
        reject(res, message, code);
        return;
      }

      if (skipSuccessfulRequests || skipFailedRequests) {
        res.on('finish', () => {
          if (
            (skipSuccessfulRequests && res.statusCode < HTTP_STATUS.HTTP_400_BAD_REQUEST) ||
            (skipFailedRequests && res.statusCode >= HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR)
          ) {
            decrementMemoryCount(key);
          }
        });
      }

      next();
      return;
    }

    const redisKey = `rate-limit:${key}`;
    const count = await redis.incr(redisKey);

    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    if (skipSuccessfulRequests || skipFailedRequests) {
      res.on('finish', () => {
        if (
          (skipSuccessfulRequests && res.statusCode < HTTP_STATUS.HTTP_400_BAD_REQUEST) ||
          (skipFailedRequests && res.statusCode >= HTTP_STATUS.HTTP_500_INTERNAL_SERVER_ERROR)
        ) {
          void redis.decr(redisKey);
        }
      });
    }

    if (count > maxAttempts) {
      reject(res, message, code);
      return;
    }

    next();
  };
}

function getEmail(req: Parameters<typeof getClientIp>[0]): string {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.toLowerCase() : getClientIp(req);
}

export const loginRateLimit = createRateLimit({
  prefix: 'login',
  windowSeconds: Math.ceil(env.LOGIN_RATE_LIMIT_WINDOW_MS / TIME_MS.ONE_SECOND),
  maxAttempts: env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many failed login attempts. Please try again later.',
  code: 'RATE_LIMITED',
  skipSuccessfulRequests: true,
});

export const registerRateLimit = createRateLimit({
  prefix: 'register',
  windowSeconds: env.REGISTER_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.REGISTER_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many registration requests. Please try again later.',
});

export const forgotPasswordRateLimit = createRateLimit({
  prefix: 'forgot-password',
  windowSeconds: env.FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many password reset requests. Please try again later.',
  code: 'RATE_LIMITED',
  getBucketKey: getEmail,
});

export const resetPasswordRateLimit = createRateLimit({
  prefix: 'reset-password',
  windowSeconds: env.RESET_PASSWORD_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.RESET_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many password reset attempts. Please try again later.',
  code: 'RATE_LIMITED',
});

export const resetPasswordTokenCheckRateLimit = createRateLimit({
  prefix: 'reset-password-check',
  windowSeconds: env.RESET_PASSWORD_TOKEN_CHECK_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.RESET_PASSWORD_TOKEN_CHECK_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many reset token verification attempts. Please try again later.',
  code: 'RATE_LIMITED',
  skipSuccessfulRequests: true,
});

export const resendVerificationEmailRateLimit = createRateLimit({
  prefix: 'resend-verification',
  windowSeconds: env.RESEND_VERIFICATION_EMAIL_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.RESEND_VERIFICATION_EMAIL_RATE_LIMIT_MAX_ATTEMPTS,
  message: 'Too many verification email requests. Please try again later.',
  code: 'RATE_LIMITED',
  getBucketKey: getEmail,
  skipFailedRequests: true,
});

const verificationAttemptRateLimit = {
  prefix: 'verify-email-invalid',
  windowSeconds: env.VERIFICATION_ATTEMPT_RATE_LIMIT_WINDOW_SECONDS,
  maxAttempts: env.VERIFICATION_ATTEMPT_RATE_LIMIT_MAX_ATTEMPTS,
  getBucketKey: getClientIp,
};

export async function consumeVerificationAttemptRateLimit(
  req: Parameters<typeof getClientIp>[0],
): Promise<RateLimitAttemptResult> {
  return consumeRateLimitAttempt(verificationAttemptRateLimit, req);
}
