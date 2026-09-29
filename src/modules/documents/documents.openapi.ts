import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export function registerDocumentsOpenApi(registry: OpenAPIRegistry): void {
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
    responses: { 200: { description: 'Paginated documents' } },
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
