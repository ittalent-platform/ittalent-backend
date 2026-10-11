import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  documentListQuerySchema,
  documentResponseSchema,
  documentUploadRequestSchema,
  paginatedDocumentsSchema,
} from './documents.schemas.js';

export function registerDocumentsOpenApi(registry: OpenAPIRegistry): void {
  const document = registry.register('Document', documentResponseSchema);
  const uploadRequest = registry.register('UploadDocumentRequest', documentUploadRequestSchema);
  const listQuery = registry.register('DocumentListQuery', documentListQuerySchema);
  const paginatedDocuments = registry.register('PaginatedDocuments', paginatedDocumentsSchema);
  registry.registerPath({
    method: 'post',
    path: '/api/v1/documents',
    tags: ['Documents'],
    summary: 'Upload the current user CV or cover letter',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'multipart/form-data': { schema: uploadRequest } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Document uploaded',
        content: { 'application/json': { schema: document } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid document type or file' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_502_BAD_GATEWAY]: { description: 'Document storage upload failed' },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/documents',
    tags: ['Documents'],
    summary: 'List current user documents',
    security: [{ bearerAuth: [] }],
    request: { query: listQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated documents owned by the caller',
        content: { 'application/json': { schema: paginatedDocuments } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid document list query' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/admin/documents',
    tags: ['Documents'],
    summary: 'List all CVs and cover letters for administrators',
    security: [{ bearerAuth: [] }],
    request: { query: listQuery },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Paginated documents across all owners',
        content: { 'application/json': { schema: paginatedDocuments } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid document list query' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator role required' },
    },
  });
}
