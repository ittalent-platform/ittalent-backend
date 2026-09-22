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
