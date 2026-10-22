import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { addWishlistBodySchema, wishlistSaveResponseSchema } from './wishlist.schemas.js';

export function registerWishlistOpenApi(registry: OpenAPIRegistry): void {
  const addSchema = registry.register('AddWishlistRequest', addWishlistBodySchema);
  const saveResponseSchema = registry.register('WishlistSaveResponse', wishlistSaveResponseSchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/wishlist',
    tags: ['Wishlist'],
    summary: 'Add an active job posting to candidate wishlist',
    description:
      'Saves an active, published job posting to the authenticated applicant personal wishlist. Enforces a maximum capacity limit of 500 saved jobs. Idempotent: repeated calls on an already-saved job return 200 OK.',
    security: [{ bearerAuth: [] }],
    request: {
      body: { required: true, content: { 'application/json': { schema: addSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Job added to wishlist successfully',
        content: { 'application/json': { schema: saveResponseSchema } },
      },
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job is already in wishlist (idempotent)',
        content: { 'application/json': { schema: saveResponseSchema } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Target job is closed, expired, or enterprise is inactive' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Saving jobs is for candidate accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Job posting not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Wishlist capacity limit reached (maximum 500 saved jobs)' },
    },
  });
}
