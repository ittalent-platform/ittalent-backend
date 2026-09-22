import { z } from 'zod';

import { TIME_MS, TIME_SECONDS } from '../shared/constants/time.js';

const PORT_MAX_LIMIT = 65_535;
const DEFAULT_PORT = 3000;
const JWT_SECRET_MIN_LENGTH = 32;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = TIME_MS.ONE_MINUTE;
const DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const DEFAULT_REGISTER_RATE_LIMIT_WINDOW_SECONDS = TIME_SECONDS.FIFTEEN_MINUTES;
const DEFAULT_REGISTER_RATE_LIMIT_MAX_ATTEMPTS = 3;

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(PORT_MAX_LIMIT).default(DEFAULT_PORT),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH, `JWT_ACCESS_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`),
  JWT_REFRESH_SECRET: z.string().min(JWT_SECRET_MIN_LENGTH, `JWT_REFRESH_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters`),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  OPENAPI_SERVER_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS),
  REGISTER_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(DEFAULT_REGISTER_RATE_LIMIT_WINDOW_SECONDS),
  REGISTER_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(DEFAULT_REGISTER_RATE_LIMIT_MAX_ATTEMPTS),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;
