import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { myProfileSchema, updateMyProfileSchema } from './my-profile.schemas.js';

export function registerMyProfileOpenApi(registry: OpenAPIRegistry): void {
  const response = registry.register('MyProfile', myProfileSchema);
  const update = registry.register('UpdateMyProfile', updateMyProfileSchema);
  const errors = { 400: { description: 'Invalid input' }, 401: { description: 'Authentication required' }, 404: { description: 'Profile not found' } };
  registry.registerPath({ method: 'get', path: '/api/v1/me/profile', operationId: 'getMyProfile', tags: ['My Profile'], security: [{ bearerAuth: [] }], responses: { 200: { description: 'Current profile', content: { 'application/json': { schema: response } } }, 401: errors[401], 404: errors[404] } });
  registry.registerPath({ method: 'patch', path: '/api/v1/me/profile', operationId: 'updateMyProfile', tags: ['My Profile'], security: [{ bearerAuth: [] }], request: { body: { required: true, content: { 'application/json': { schema: update } } } }, responses: { 200: { description: 'Updated profile', content: { 'application/json': { schema: response } } }, ...errors } });
  registry.registerPath({ method: 'patch', path: '/api/v1/me/profile/avatar', operationId: 'uploadMyAvatar', tags: ['My Profile'], security: [{ bearerAuth: [] }], request: { body: { required: true, content: { 'multipart/form-data': { schema: registry.register('MyAvatarUpload', z.object({ avatar: z.string().openapi({ type: 'string', format: 'binary' }) })) } } } }, responses: { 200: { description: 'Updated profile', content: { 'application/json': { schema: response } } }, ...errors, 502: { description: 'Storage unavailable' }, 503: { description: 'Storage not configured' } } });
}
