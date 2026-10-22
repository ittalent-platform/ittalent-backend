import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  addWishlistBodySchema,
  wishlistBulkDeleteResponseSchema,
  wishlistCheckResponseSchema,
  wishlistDeleteResponseSchema,
  wishlistIdParamSchema,
  wishlistJobParamSchema,
  wishlistQuerySchema,
  wishlistResponseSchema,
  wishlistSaveResponseSchema,
  wishlistToggleResponseSchema,
} from './wishlist.schemas.js';

export function registerWishlistOpenApi(registry: OpenAPIRegistry): void {
  const addSchema = registry.register('AddWishlistRequest', addWishlistBodySchema);
  const saveResponseSchema = registry.register('WishlistSaveResponse', wishlistSaveResponseSchema);
  const toggleResponse = registry.register('WishlistToggleResponse', wishlistToggleResponseSchema);
  const checkResponseSchema = registry.register('WishlistCheckResponse', wishlistCheckResponseSchema);
  const paginatedResponse = registry.register('PaginatedWishlistResponse', wishlistResponseSchema);
  const querySchema = registry.register('WishlistQuery', wishlistQuerySchema);
  const deleteResponseSchema = registry.register('WishlistDeleteResponse', wishlistDeleteResponseSchema);
  const bulkDeleteResponseSchema = registry.register('WishlistBulkDeleteResponse', wishlistBulkDeleteResponseSchema);

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
    method: 'patch',
    path: '/api/v1/me/wishlist/jobs/{jobId}/toggle',
    tags: ['Wishlist'],
    summary: 'Toggle job bookmark status in candidate wishlist',
    description:
      'Toggles bookmark state: if already saved, removes it from wishlist; if unsaved, adds it to wishlist. Enforces active job and 500-item capacity rules.',
    security: [{ bearerAuth: [] }],
    request: {
      params: wishlistJobParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Bookmark status toggled successfully',
        content: { 'application/json': { schema: toggleResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Target job is closed, expired, or invalid ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Saving jobs is for candidate accounts' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Job posting not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Wishlist capacity limit reached (maximum 500 saved jobs)' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/wishlist/toggle',
    tags: ['Wishlist'],
    summary: 'Toggle job bookmark status (JSON body alias)',
    description: 'Alias for heart icon toggle accepting jobId in JSON request body.',
    security: [{ bearerAuth: [] }],
    request: {
      body: { required: true, content: { 'application/json': { schema: addSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Bookmark status toggled successfully',
        content: { 'application/json': { schema: toggleResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Target job is closed, expired, or invalid ID' },
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

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/wishlist/jobs/{jobId}',
    tags: ['Wishlist'],
    summary: 'Remove a saved job from candidate wishlist by job ID',
    description:
      'Removes the specified job posting from candidate wishlist. Idempotent: if already removed, returns 200 OK with alreadyRemoved=true.',
    security: [{ bearerAuth: [] }],
    request: {
      params: wishlistJobParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job removed from wishlist successfully (or already removed)',
        content: { 'application/json': { schema: deleteResponseSchema } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid job ID format' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Removing saved jobs is for candidate accounts' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/wishlist/unavailable',
    tags: ['Wishlist'],
    summary: 'Bulk remove all unavailable or closed saved jobs',
    description:
      'Purges all bookmarks whose target job posting is closed, expired, or whose company is inactive from candidate wishlist.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Unavailable saved jobs cleared successfully',
        content: { 'application/json': { schema: bulkDeleteResponseSchema } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Removing saved jobs is for candidate accounts' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/wishlist/{id}',
    tags: ['Wishlist'],
    summary: 'Remove a saved job from candidate wishlist by wishlist record ID',
    description:
      'Removes the wishlist record matching ID belonging to the candidate. Idempotent: if already removed, returns 200 OK with alreadyRemoved=true.',
    security: [{ bearerAuth: [] }],
    request: {
      params: wishlistIdParamSchema,
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Job removed from wishlist successfully (or already removed)',
        content: { 'application/json': { schema: deleteResponseSchema } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid wishlist ID format' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Removing saved jobs is for candidate accounts' },
    },
  });
}
