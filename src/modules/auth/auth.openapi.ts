import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  authResponseSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  refreshTokenResponseSchema,
  registerRequestSchema,
  userDtoSchema,
} from './auth.schemas.js';

export function registerAuthOpenApi(registry: OpenAPIRegistry): void {
  const registeredRegisterRequest = registry.register('RegisterRequest', registerRequestSchema);
  const registeredLoginRequest = registry.register('LoginRequest', loginRequestSchema);
  const registeredRefreshTokenRequest = registry.register('RefreshTokenRequest', refreshTokenRequestSchema);
  const registeredAuthResponse = registry.register('AuthResponse', authResponseSchema);
  const registeredRefreshTokenResponse = registry.register('RefreshTokenResponse', refreshTokenResponseSchema);
  const registeredUserDto = registry.register('UserDTO', userDtoSchema);

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
            schema: registeredAuthResponse,
          },
        },
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Email or username already exists',
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
