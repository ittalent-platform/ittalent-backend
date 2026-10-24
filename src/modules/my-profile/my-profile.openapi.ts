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
  const profileError = registry.register('MyProfileError', z.object({
    success: z.literal(false),
    message: z.string(),
    code: z.enum([
      'AUTHENTICATION_REQUIRED',
      'INVALID_AUTHENTICATION_TOKEN',
      'SESSION_REVOKED',
      'EMAIL_NOT_VERIFIED',
      'ACCOUNT_INACTIVE',
      'ACCOUNT_SUSPENDED',
      'ACCOUNT_BLOCKED',
      'VERSION_CONFLICT',
      'AVATAR_REQUIRED',
      'AVATAR_INVALID_CONTENT',
      'AVATAR_DIMENSIONS_INVALID',
      'AVATAR_FILE_TOO_LARGE',
      'AVATAR_INVALID_UPLOAD',
      'STORAGE_OWNERSHIP_MISMATCH',
      'VALIDATION_ERROR',
    ]).optional(),
  }));
  const errorContent = { 'application/json': { schema: profileError } };
  const errors = {
    [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid input', content: errorContent },
    [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session is no longer current', content: errorContent },
    [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Current persisted account is unverified, inactive, suspended, or blocked', content: errorContent },
    [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Profile not found', content: errorContent },
  };

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/profile',
    operationId: 'getMyProfile',
    tags: ['My Profile'],
    summary: 'Read the shared self profile for an authenticated role',
    description: 'Candidate maps to role `user` and may receive the explicit `basic` projection during the email-verification grace window. Verified Active users with the existing `user`, `admin`, `recruiter`, `enterprise_admin`, or `applicant` role receive the `full` projection. Suspended and blocked accounts are denied.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Current profile',
        content: { 'application/json': { schema: response } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: errors[HTTP_STATUS.HTTP_401_UNAUTHORIZED],
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: errors[HTTP_STATUS.HTTP_403_FORBIDDEN],
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: errors[HTTP_STATUS.HTTP_404_NOT_FOUND],
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/profile',
    operationId: 'updateMyProfile',
    tags: ['My Profile'],
    security: [{ bearerAuth: [] }],
    summary: 'Update fullName or phone on the shared self profile',
    description: 'Requires the current persisted account to be verified and Active. `expectedVersion` is mandatory. A normalized no-op returns the existing persisted projection without incrementing the version or writing an audit event.',
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
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Profile version conflict (`VERSION_CONFLICT`)', content: errorContent },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/profile/avatar',
    operationId: 'uploadMyAvatar',
    tags: ['My Profile'],
    security: [{ bearerAuth: [] }],
    summary: 'Replace the validated owned avatar for the shared self profile',
    description: 'Requires a verified Active persisted account. The server decodes and re-encodes one JPEG, PNG, or WebP image under deployment-configured safety bounds. Provider details and an exact product-facing byte ceiling are not part of this contract.',
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
      [HTTP_STATUS.HTTP_502_BAD_GATEWAY]: { description: 'Storage unavailable', content: errorContent },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Storage not configured', content: errorContent },
    },
  });
}
