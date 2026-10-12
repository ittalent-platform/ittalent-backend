import { z } from 'zod';

import { documentTypes } from '../../models/document.model.js';
import { PAGINATION } from '../../shared/constants/pagination.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { DOCUMENT_SEARCH_MAX_LENGTH } from './documents.constants.js';

export const documentUploadSchema = z.object({
  type: z.enum(documentTypes),
});

export const documentUploadRequestSchema = documentUploadSchema.extend({
  file: z.string().openapi({
    format: 'binary',
    description: 'PDF, DOC, or DOCX file up to 5 MB',
  }),
});

export const documentListQuerySchema = z.object({
  type: z.enum(documentTypes).optional(),
  search: z.string().trim().min(1).max(DOCUMENT_SEARCH_MAX_LENGTH).optional(),
  is_default: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sort_by: z.enum(['created_at', 'file_name', 'size']).optional(),
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export const documentIdParamSchema = z.object({
  id: objectIdSchema('document ID'),
});

export const documentResponseSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  type: z.enum(documentTypes),
  fileUrl: z.string().url(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

export const documentPreviewResponseSchema = z.object({
  previewUrl: z.string().url(),
});

export const paginatedDocumentsSchema = z.object({
  items: z.array(documentResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type DocumentUpload = z.infer<typeof documentUploadSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type PaginatedDocuments = z.infer<typeof paginatedDocumentsSchema>;
export type DocumentIdParam = z.infer<typeof documentIdParamSchema>;
export type DocumentPreviewResponse = z.infer<
  typeof documentPreviewResponseSchema
>;
