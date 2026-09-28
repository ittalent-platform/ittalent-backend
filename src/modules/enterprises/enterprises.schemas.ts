import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { ENTERPRISE_CONFIG } from './enterprises.constants.js';

export const enterpriseIdParamSchema = z.object({
  enterpriseId: objectIdSchema('enterprise ID'),
});

export type EnterpriseIdParam = z.infer<typeof enterpriseIdParamSchema>;

const searchTextSchema = z
  .string()
  .trim()
  .min(ENTERPRISE_CONFIG.KEYWORD_MIN_LENGTH, 'Search value must not be empty')
  .max(ENTERPRISE_CONFIG.KEYWORD_MAX_LENGTH, `Search value cannot exceed ${ENTERPRISE_CONFIG.KEYWORD_MAX_LENGTH} characters`);

// One endpoint covers both "view list" and "search": with no keyword/criteria it is the default list.
// strictObject rejects unsupported query keys (BR-21).
export const enterpriseListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  keyword: searchTextSchema.optional(),
  industry: searchTextSchema.optional(),
  location: searchTextSchema.optional(),
});

export type EnterpriseListQuery = z.infer<typeof enterpriseListQuerySchema>;

export const enterpriseSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  industry: z.string().nullable(),
  location: z.string().nullable(),
  shortDescription: z.string().nullable(),
});

export type EnterpriseSummaryDTO = z.infer<typeof enterpriseSummarySchema>;

export const enterpriseDetailSchema = enterpriseSummarySchema.extend({
  description: z.string().nullable(),
  website: z.string().nullable(),
});

export type EnterpriseDetailDTO = z.infer<typeof enterpriseDetailSchema>;

export const enterpriseListResponseSchema = paginatedResponseSchema(enterpriseSummarySchema);

export type EnterpriseListResponse = z.infer<typeof enterpriseListResponseSchema>;