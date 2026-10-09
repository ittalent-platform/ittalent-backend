import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  documentListQuerySchema,
  documentIdParamSchema,
  documentPreviewResponseSchema,
  documentResponseSchema,
  documentUploadRequestSchema,
  paginatedDocumentsSchema,
} from './documents.schemas.js';

export function registerDocumentsOpenApi(registry: OpenAPIRegistry): void {
  const document = registry.register('Document', documentResponseSchema);
  const uploadRequest = registry.register(
    'UploadDocumentRequest',
    documentUploadRequestSchema,
  );
  const listQuery = registry.register(
    'DocumentListQuery',
    documentListQuerySchema,
  );
  const paginatedDocuments = registry.register(
    'PaginatedDocuments',
    paginatedDocumentsSchema,
  );
  const previewResponse = registry.register(
    'DocumentPreviewResponse',
    documentPreviewResponseSchema,
  );
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
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid document type or file',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
      [HTTP_STATUS.HTTP_502_BAD_GATEWAY]: {
        description: 'Document storage upload failed',
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/documents/{id}/download',
    tags: ['Documents'],
    summary: 'Download an owned active document',
    security: [{ bearerAuth: [] }],
    request: { params: documentIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: { description: 'Document file stream' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Owned active document not found',
      },
      [HTTP_STATUS.HTTP_502_BAD_GATEWAY]: {
        description: 'Storage file unavailable',
      },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/v1/documents/{id}/preview',
    tags: ['Documents'],
    summary: 'Preview an owned active document',
    security: [{ bearerAuth: [] }],
    request: { params: documentIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Inline PDF stream or DOC/DOCX viewer URL',
        content: { 'application/json': { schema: previewResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Owned active document not found',
      },
    },
  });
  registry.registerPath({
    method: 'patch',
    path: '/api/v1/documents/{id}/default',
    tags: ['Documents'],
    summary: 'Set an owned active document as the default for its type',
    security: [{ bearerAuth: [] }],
    request: { params: documentIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Selected default document',
        content: { 'application/json': { schema: document } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Owned active document not found',
      },
    },
  });
  registry.registerPath({
    method: 'delete',
    path: '/api/v1/documents/{id}',
    tags: ['Documents'],
    summary: 'Soft-delete an owned active document',
    description:
      'Deletion is blocked while any application references the document. Deleting a default promotes the newest remaining active document of the same type.',
    security: [{ bearerAuth: [] }],
    request: { params: documentIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: {
        description: 'Document deleted from the active library',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: {
        description: 'Owned active document not found',
      },
      [HTTP_STATUS.HTTP_409_CONFLICT]: {
        description: 'Document is referenced by an application',
      },
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
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: {
        description: 'Invalid document list query',
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: {
        description: 'Authentication required',
      },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: {
        description: 'Document owner role required',
      },
    },
  });
}
