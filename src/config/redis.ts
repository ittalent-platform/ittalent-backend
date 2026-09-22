import { createClient } from 'redis';

import { env } from './env.js';

const redisConnectTimeoutMs = 500;

type RedisClient = ReturnType<typeof createClient>;

const redis: RedisClient | undefined = env.REDIS_URL
  ? createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: redisConnectTimeoutMs,
        reconnectStrategy: false,
      },
    })
  : undefined;

if (redis) {
  redis.on('error', (error) => {
    if (!redis?.isOpen) {
      return;
    }

    console.error('Redis client error', error);
  });
}

let connection: Promise<RedisClient | undefined> | undefined;
let redisUnavailable = false;

function markRedisUnavailable(): void {
  redisUnavailable = true;
  connection = undefined;

  if (redis?.isOpen) {
    void redis.disconnect().catch(() => undefined);
  }
}

export async function getRedis(): Promise<RedisClient | undefined> {
  if (!redis || redisUnavailable) {
    return undefined;
  }

  if (!redis.isOpen) {
    connection ??= redis
      .connect()
      .then(() => redis)
      .catch(() => {
        console.warn('Redis unavailable, falling back to in-memory rate limiting.');
        markRedisUnavailable();
        return undefined;
      });

    await connection;
  }

  return redisUnavailable ? undefined : redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis?.isOpen) {
    await redis.quit();
  }

  redisUnavailable = false;
  connection = undefined;
}
