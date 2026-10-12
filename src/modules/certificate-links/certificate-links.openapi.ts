import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { idempotencyKeySchema, certificateLinkIdParamSchema, certificateLinkListQuerySchema, certificateLinkResponseSchema, createCertificateLinkSchema, deleteCertificateLinkQuerySchema, paginatedCertificateLinksSchema, updateCertificateLinkSchema } from './certificate-links.schemas.js';

export function registerCertificateLinksOpenApi(registry: OpenAPIRegistry): void {
  const createSchema = registry.register('CreateCertificateLinkRequest', createCertificateLinkSchema);
  const itemSchema = registry.register('CertificateLink', certificateLinkResponseSchema);
  const querySchema = registry.register('CertificateLinkListQuery', certificateLinkListQuerySchema);
  const pageSchema = registry.register('PaginatedCertificateLinks', paginatedCertificateLinksSchema);
  const updateSchema = registry.register('UpdateCertificateLinkRequest', updateCertificateLinkSchema);

  registry.registerPath({
    method: 'post',
    path: '/api/v1/me/certificate-links',
    tags: ['Certificate Links'],
    summary: 'Create a private certificate link for the current Candidate',
    security: [{ bearerAuth: [] }],
    request: {
      headers: z.object({ 'Idempotency-Key': idempotencyKeySchema.openapi({ description: 'Unique operation key. Reuse only when retrying the exact same request.', example: '9c9ccf4b-2f18-4b5e-a67d-10de8ea8da02' }) }),
      body: { required: true, content: { 'application/json': { schema: createSchema } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: { description: 'Certificate link created', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Previously committed request replayed', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid request or missing Idempotency-Key' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'Duplicate URL or idempotency key reused with different content' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Certificate link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/me/certificate-links',
    tags: ['Certificate Links'],
    summary: 'List the current Candidate’s private certificate links',
    security: [{ bearerAuth: [] }],
    request: { query: querySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Stable page of available owned links', content: { 'application/json': { schema: pageSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid pagination' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Certificate link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/me/certificate-links/{id}',
    tags: ['Certificate Links'],
    summary: 'Update an owned certificate link or its "suggest on apply" flag',
    description: 'Metadata changes bump the version; a suggested-only change keeps it. Applications already sent keep their own copy.',
    security: [{ bearerAuth: [] }],
    request: { params: certificateLinkIdParamSchema, body: { required: true, content: { 'application/json': { schema: updateSchema } } } },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Updated certificate link', content: { 'application/json': { schema: itemSchema } } },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid fields or expiry before issued date' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Certificate link not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'VERSION_CONFLICT or DUPLICATE_CERTIFICATE_URL' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Certificate link storage unavailable' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/me/certificate-links/{id}',
    tags: ['Certificate Links'],
    summary: 'Delete an owned certificate link',
    description: 'Applications already sent keep their own copy of the certificate.',
    security: [{ bearerAuth: [] }],
    request: { params: certificateLinkIdParamSchema, query: deleteCertificateLinkQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Certificate link deleted' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required or session revoked' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Active verified Candidate account required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Certificate link not found' },
      [HTTP_STATUS.HTTP_409_CONFLICT]: { description: 'VERSION_CONFLICT' },
      [HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE]: { description: 'Certificate link storage unavailable' },
    },
  });
}
