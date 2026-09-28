import { z } from 'zod';
import { documentTypes } from '../../models/document.model.js';
import { PAGINATION } from '../../shared/constants/pagination.js';
export const documentUploadSchema = z.object({ type: z.enum(documentTypes) });
export const documentListQuerySchema = z.object({ type: z.enum(documentTypes).optional(), page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE), limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT), sort_order: z.enum(['asc', 'desc']).default('desc') });
export type DocumentUpload = z.infer<typeof documentUploadSchema>;
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export const documentResponseSchema = z.object({ id: z.string(), ownerId: z.string(), type: z.enum(documentTypes), fileUrl: z.string().url(), fileName: z.string(), mimeType: z.string(), size: z.number(), createdAt: z.string() });
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
