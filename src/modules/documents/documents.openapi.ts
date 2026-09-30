import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { documentListQuerySchema, documentResponseSchema } from './documents.schemas.js';

export function registerDocumentsOpenApi(registry: OpenAPIRegistry): void {
  const document = registry.register('DocumentResponse', documentResponseSchema);
  const paginatedDocuments = registry.register(
    'PaginatedDocumentsResponse',
    z.object({ items: z.array(document), page: z.number(), limit: z.number(), total: z.number(), totalPages: z.number() }),
  );
  registry.registerPath({
    method: 'post',
    path: '/api/v1/documents',
    tags: ['Documents'],
    summary: 'Upload the current user CV or cover letter',
    security: [{ bearerAuth: [] }],
    responses: { 201: { description: 'Document uploaded' } },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/documents',
    tags: ['Documents'],
    summary: 'List current user documents',
    security: [{ bearerAuth: [] }],
    request: { query: documentListQuerySchema },
    responses: { 200: { description: 'Paginated documents', content: { 'application/json': { schema: paginatedDocuments } } } },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/admin/documents',
    tags: ['Documents'],
    summary: 'List all CVs and cover letters for administrators',
    security: [{ bearerAuth: [] }],
    responses: { 200: { description: 'Paginated documents' } },
  });
}