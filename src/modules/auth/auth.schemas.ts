import { z } from 'zod';
import { AUTH_CONFIG, USERNAME_REGEX } from './auth.constants.js';

export const registerRequestSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
  username: z
    .string()
    .min(
      AUTH_CONFIG.USERNAME_MIN_LENGTH,
      `Username must be at least ${AUTH_CONFIG.USERNAME_MIN_LENGTH} characters`,
    )
    .max(
      AUTH_CONFIG.USERNAME_MAX_LENGTH,
      `Username cannot exceed ${AUTH_CONFIG.USERNAME_MAX_LENGTH} characters`,
    )
    .regex(USERNAME_REGEX, 'Username may only contain letters, numbers, and underscores')
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(AUTH_CONFIG.PASSWORD_MIN_LENGTH, `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters`),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

export const userDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  role: z.string(),
  status: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type UserDTO = z.infer<typeof userDtoSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authResponseSchema = z.object({
  user: userDtoSchema,
  tokens: authTokensSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

export const refreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type RefreshTokenResponse = z.infer<typeof refreshTokenResponseSchema>;
