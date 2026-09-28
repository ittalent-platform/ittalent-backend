import { z } from 'zod';
import { AUTH_CONFIG, PASSWORD_REGEX, USERNAME_REGEX } from './auth.constants.js';

export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(
    AUTH_CONFIG.PASSWORD_MIN_LENGTH,
    `Password must be at least ${AUTH_CONFIG.PASSWORD_MIN_LENGTH} characters`,
  )
  .max(
    AUTH_CONFIG.PASSWORD_MAX_LENGTH,
    `Password cannot exceed ${AUTH_CONFIG.PASSWORD_MAX_LENGTH} characters`,
  )
  .regex(PASSWORD_REGEX.UPPERCASE, 'Password must contain at least one uppercase letter')
  .regex(PASSWORD_REGEX.LOWERCASE, 'Password must contain at least one lowercase letter')
  .regex(PASSWORD_REGEX.NUMBER, 'Password must contain at least one number')
  .regex(
    PASSWORD_REGEX.SPECIAL,
    'Password must contain at least one special character (!@#$%^&*)',
  );

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
  password: passwordSchema,
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

export const registerResponseSchema = z.object({
  user: userDtoSchema,
  tokens: authTokensSchema,
  verificationEmailSent: z.boolean(),
});

export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;

export const resendVerificationEmailRequestSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
});

export type ResendVerificationEmailRequest = z.infer<typeof resendVerificationEmailRequestSchema>;

export const resendVerificationEmailResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    verificationEmailSent: z.boolean(),
  }),
});

export type ResendVerificationEmailResponse = z.infer<typeof resendVerificationEmailResponseSchema>;

export const refreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type RefreshTokenResponse = z.infer<typeof refreshTokenResponseSchema>;

export const forgotPasswordRequestSchema = z.object({
  email: z.string().email('Invalid email address').trim().toLowerCase(),
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const forgotPasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({}).default({}),
});

export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

export const resetPasswordTokenQuerySchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
});

export type ResetPasswordTokenQuery = z.infer<typeof resetPasswordTokenQuerySchema>;

export const resetPasswordTokenResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.object({ valid: z.boolean() }),
});

export type ResetPasswordTokenResponse = z.infer<typeof resetPasswordTokenResponseSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema,
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const resetPasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({}).default({}),
});

export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  revokeOtherSessions: z.boolean().optional(),
});

export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const changePasswordResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({}).default({}),
});

export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;

