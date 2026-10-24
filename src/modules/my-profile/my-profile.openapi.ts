import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { myProfileSchema, updateMyProfileSchema } from './my-profile.schemas.js';

export function registerMyProfileOpenApi(registry: OpenAPIRegistry): void {
  const response = registry.register('MyProfile', myProfileSchema);
  const update = registry.register('UpdateMyProfile', updateMyProfileSchema);
  const avatarUpload = registry.register(
    'MyAvatarUpload',
    z.object({ avatar: z.string().openapi({ type: 'string', format: 'binary' }) }),
  );
  const errors = {
    [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid input' },
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Profile not found' },
  };

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/profile',
    operationId: 'getMyProfile',
    tags: ['My Profile'],
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Current profile',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: errors[HTTP_STATUS.HTTP_401_UNAUTHORIZED],
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: errors[HTTP_STATUS.HTTP_404_NOT_FOUND],
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/profile',
    operationId: 'updateMyProfile',
    tags: ['My Profile'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: update } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Updated profile',
        content: { 'application/json': { schema: response } },
      },
      ...errors,
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Profile version conflict' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/profile/avatar',
    operationId: 'uploadMyAvatar',
    tags: ['My Profile'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'multipart/form-data': { schema: avatarUpload } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Updated profile',
        content: { 'application/json': { schema: response } },
      },
      ...errors,
      [HTTP_STATUS.HTTP_502_BAD_GATEWAY]: { description: 'Storage unavailable' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Storage not configured' },
    },
  });
}
