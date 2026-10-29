import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createPortfolioLinkSchema, deletePortfolioLinkQuerySchema, idempotencyKeySchema, paginatedPortfolioLinksSchema, portfolioLinkIdParamSchema, portfolioLinkListQuerySchema, portfolioLinkResponseSchema, updatePortfolioLinkSchema } from './portfolio-links.schemas.js';

export function registerPortfolioLinksOpenApi(registry: OpenAPIRegistry): void {
  const createSchema = registry.register('CreatePortfolioLinkRequest', createPortfolioLinkSchema);
  const updateSchema = registry.register('UpdatePortfolioLinkRequest', updatePortfolioLinkSchema);
  const itemSchema = registry.register('PortfolioLink', portfolioLinkResponseSchema);
  const querySchema = registry.register('PortfolioLinkListQuery', portfolioLinkListQuerySchema);
  const pageSchema = registry.register('PaginatedPortfolioLinks', paginatedPortfolioLinksSchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/portfolio-links',
    tags: ['Portfolio Links'],
    summary: 'Create a private portfolio link for the current Candidate',
    security: [{ bearerAuth: [] }],
    request: {
      headers: z.object({ 'Idempotency-Key': idempotencyKeySchema.openapi({ description: 'Unique operation key. Reuse only when retrying the exact same request.', example: '9c9ccf4b-2f18-4b5e-a67d-10de8ea8da02' }) }),
      body: { required: true, content: { 'application/json': { schema: createSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: { description: 'Portfolio link created', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Previously committed request replayed', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid request or missing Idempotency-Key' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'DUPLICATE_PORTFOLIO_URL or idempotency key reused with different content' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Portfolio link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/portfolio-links',
    tags: ['Portfolio Links'],
    summary: 'List or search the current Candidate’s private portfolio links',
    description: 'With `keyword`, only links whose title, URL or description contain it (case-insensitive) are returned. Stored metadata only; external pages are never fetched.',
    security: [{ bearerAuth: [] }],
    request: { query: querySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Stable page of owned links, newest first', content: { 'application/json': { schema: pageSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid pagination or search query' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Candidate role required' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Portfolio link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/portfolio-links/{id}',
    tags: ['Portfolio Links'],
    summary: 'Update the title, URL or description of an owned portfolio link',
    description: 'A field that is left out keeps its value; `description: null` or an empty string removes it. Send the version that was loaded for editing. Earlier application snapshots are not changed. An update that changes nothing, or the retry of one that already committed, returns the stored link without a new version.',
    security: [{ bearerAuth: [] }],
    request: { params: portfolioLinkIdParamSchema, body: { required: true, content: { 'application/json': { schema: updateSchema } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Updated portfolio link', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid or empty update, or unsafe URL' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Portfolio link not found or owned by someone else' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'VERSION_CONFLICT or DUPLICATE_PORTFOLIO_URL' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Portfolio link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/portfolio-links/{id}',
    tags: ['Portfolio Links'],
    summary: 'Delete an owned portfolio link',
    description: 'Removes only the platform reference, not the external content.',
    security: [{ bearerAuth: [] }],
    request: { params: portfolioLinkIdParamSchema, query: deletePortfolioLinkQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Portfolio link deleted' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Portfolio link not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'VERSION_CONFLICT' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Portfolio link storage unavailable' },
    },
  });
}
