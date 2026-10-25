import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  authResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  resendVerificationEmailRequestSchema,
  resendVerificationEmailResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  resetPasswordTokenQuerySchema,
  resetPasswordTokenResponseSchema,
  userDtoSchema,
  verifyEmailQuerySchema,
} from './auth.schemas.js';

export function registerAuthOpenApi(registry: OpenAPIRegistry): void {
  const registeredRegisterRequest = registry.register('RegisterRequest', registerRequestSchema);
  const registeredRegisterResponse = registry.register('RegisterResponse', registerResponseSchema);
  const registeredLoginRequest = registry.register('LoginRequest', loginRequestSchema);
  const registeredRefreshTokenRequest = registry.register('RefreshTokenRequest', refreshTokenRequestSchema);
  const registeredAuthResponse = registry.register('AuthResponse', authResponseSchema);
  const registeredRefreshTokenResponse = registry.register('RefreshTokenResponse', refreshTokenResponseSchema);
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);
  const registeredVerifyEmailQuery = registry.register('VerifyEmailQuery', verifyEmailQuerySchema);
  const registeredResendVerificationEmailRequest = registry.register(
    'ResendVerificationEmailRequest',
    resendVerificationEmailRequestSchema,
  );
  const registeredResendVerificationEmailResponse = registry.register(
    'ResendVerificationEmailResponse',
    resendVerificationEmailResponseSchema,
  );
  const registeredForgotPasswordRequest = registry.register(
    'ForgotPasswordRequest',
    forgotPasswordRequestSchema,
  );
  const registeredForgotPasswordResponse = registry.register(
    'ForgotPasswordResponse',
    forgotPasswordResponseSchema,
  );
  const registeredResetPasswordTokenQuery = registry.register(
    'ResetPasswordTokenQuery',
    resetPasswordTokenQuerySchema,
  );
  const registeredResetPasswordTokenResponse = registry.register(
    'ResetPasswordTokenResponse',
    resetPasswordTokenResponseSchema,
  );
  const registeredResetPasswordRequest = registry.register(
    'ResetPasswordRequest',
    resetPasswordRequestSchema,
  );
  const registeredResetPasswordResponse = registry.register(
    'ResetPasswordResponse',
    resetPasswordResponseSchema,
  );
  const registeredChangePasswordRequest = registry.register(
    'ChangePasswordRequest',
    changePasswordRequestSchema,
  );
  const registeredChangePasswordResponse = registry.register(
    'ChangePasswordResponse',
    changePasswordResponseSchema,
  );
  const registeredChangePasswordError = registry.register(
    'ChangePasswordError',
    z.object({
      success: z.literal(false),
      message: z.string(),
      code: z.enum([
        'CURRENT_CREDENTIAL_INVALID',
        'AUTHENTICATION_REQUIRED',
        'INVALID_AUTHENTICATION_TOKEN',
        'PASSWORD_POLICY_INVALID',
        'PASSWORD_CONFIRMATION_INVALID',
        'PASSWORD_UNCHANGED',
        'ACCOUNT_HAS_NO_PASSWORD',
        'EMAIL_NOT_VERIFIED',
        'ACCOUNT_INACTIVE',
        'ACCOUNT_SUSPENDED',
        'ACCOUNT_BLOCKED',
        'SESSION_REVOKED',
        'RATE_LIMITED',
        'VALIDATION_ERROR',
      ]),
    }),
  );


  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/register',
    tags: ['Auth'],
    summary: 'Register a new user account',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredRegisterRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'User registered successfully',
        content: {
          'application/json': {
            schema: registeredRegisterResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Email or username already exists',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/verify-email',
    tags: ['Auth'],
    summary: 'Verify user email address using token',
    request: {
      query: registeredVerifyEmailQuery,
    },
    responses: {
      [HTTP_STATUS.HTTP_302_FOUND]: {
        description: 'Redirects to frontend verification result page',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/resend-verification-email',
    tags: ['Auth'],
    summary: 'Resend email verification link',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredResendVerificationEmailRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Verification email sent if account is unverified',
        content: {
          'application/json': {
            schema: registeredResendVerificationEmailResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Too many requests',
      },
    },
  });


  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/login',
    tags: ['Auth'],
    summary: 'Authenticate with email or username and password',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredLoginRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Authentication successful',
        content: {
          'application/json': {
            schema: registeredAuthResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Invalid credentials',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/refresh',
    tags: ['Auth'],
    summary: 'Refresh access and refresh tokens',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredRefreshTokenRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Tokens refreshed successfully',
        content: {
          'application/json': {
            schema: registeredRefreshTokenResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Invalid or expired refresh token',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/me',
    tags: ['Auth'],
    summary: 'Get current authenticated user profile',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Current user profile',
        content: {
          'application/json': {
            schema: registeredUserDto,
          },
        },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/forgot-password',
    tags: ['Auth'],
    summary: 'Request a password reset link',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredForgotPasswordRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Password reset link sent if account exists',
        content: {
          'application/json': {
            schema: registeredForgotPasswordResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Too many password reset requests',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/auth/reset-password',
    tags: ['Auth'],
    summary: 'Validate password reset token',
    request: {
      query: registeredResetPasswordTokenQuery,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Password reset token is valid',
        content: {
          'application/json': {
            schema: registeredResetPasswordTokenResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Invalid password reset link',
      },
      [HTTP_STATUS.HTTP_410_GONE]: {
        description: 'Password reset link has expired or has already been used',
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Too many token verification attempts',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/reset-password',
    tags: ['Auth'],
    summary: 'Reset password using token',
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredResetPasswordRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Password reset successful',
        content: {
          'application/json': {
            schema: registeredResetPasswordResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Invalid password reset link',
      },
      [HTTP_STATUS.HTTP_410_GONE]: {
        description: 'Password reset link has expired or has already been used',
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Too many password reset attempts',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/auth/change-password',
    tags: ['Auth'],
    summary: 'Change account password while authenticated',
    description: 'Requires currentPassword, newPassword, and matching confirmation. The server applies the fixed policy of revoking other sessions by incrementing authVersion while returning replacement tokens that keep the current session usable. Client session-control flags are rejected.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: registeredChangePasswordRequest,
          },
        },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Password changed successfully',
        content: {
          'application/json': {
            schema: registeredChangePasswordResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Current credential invalid, no local credential, password policy invalid, password unchanged, or confirmation mismatch',
        content: { 'application/json': { schema: registeredChangePasswordError } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required or session is no longer current',
        content: { 'application/json': { schema: registeredChangePasswordError } },
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Persisted account is unverified, inactive, suspended, or blocked',
        content: { 'application/json': { schema: registeredChangePasswordError } },
      },
      [HTTP_STATUS.HTTP_429_TOO_MANY_REQUESTS]: {
        description: 'Too many password change attempts (`RATE_LIMITED`)',
        content: { 'application/json': { schema: registeredChangePasswordError } },
      },
    },
  });
}
