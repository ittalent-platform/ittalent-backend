import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  authResponseSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerRequestSchema,
  registerResponseSchema,
  resendVerificationEmailRequestSchema,
  resendVerificationEmailResponseSchema,
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
}
