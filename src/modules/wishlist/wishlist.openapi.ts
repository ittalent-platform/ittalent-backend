import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  addWishlistBodySchema,
  wishlistCheckResponseSchema,
  wishlistJobParamSchema,
  wishlistQuerySchema,
  wishlistResponseSchema,
  wishlistSaveResponseSchema,
} from './wishlist.schemas.js';

export function registerWishlistOpenApi(registry: OpenAPIRegistry): void {
  const addSchema = registry.register('AddWishlistRequest', addWishlistBodySchema);
  const saveResponseSchema = registry.register('WishlistSaveResponse', wishlistSaveResponseSchema);
  const checkResponseSchema = registry.register('WishlistCheckResponse', wishlistCheckResponseSchema);
  const paginatedResponse = registry.register('PaginatedWishlistResponse', wishlistResponseSchema);
  const querySchema = registry.register('WishlistQuery', wishlistQuerySchema);

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

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/wishlist',
    tags: ['Wishlist'],
    summary: 'List and filter candidate saved jobs',
    description:
      'Retrieves a paginated list of saved jobs sorted reverse-chronologically (newest saved first). Supports text search (q), status filtering (all, available, unavailable), and location. Closed/expired jobs have sensitive details masked per privacy rules.',
    security: [{ bearerAuth: [] }],
    request: {
      query: querySchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated list of candidate saved jobs',
        content: { 'application/json': { schema: paginatedResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid query parameters or unsupported filter' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Saving jobs is for candidate accounts' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/wishlist/jobs/{jobId}',
    tags: ['Wishlist'],
    summary: 'Check if a job posting is saved in candidate wishlist',
    description: 'Returns boolean flag indicating whether the job is currently saved in the candidate wishlist.',
    security: [{ bearerAuth: [] }],
    request: {
      params: wishlistJobParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job saved status check result',
        content: { 'application/json': { schema: checkResponseSchema } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job ID format' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Saving jobs is for candidate accounts' },
    },
  });
}
