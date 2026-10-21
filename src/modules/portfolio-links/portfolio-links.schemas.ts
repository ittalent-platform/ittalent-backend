import { z } from 'zod';

import { PAGINATION } from '../../shared/constants/pagination.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { isSafeExternalUrl } from '../certificate-links/certificate-links.schemas.js';
import { PORTFOLIO_LINKS } from './portfolio-links.constants.js';

export const createPortfolioLinkSchema = z.strictObject({
  title: z.string().trim().min(1).max(PORTFOLIO_LINKS.TITLE_MAX_LENGTH),
  url: z.string().trim().max(PORTFOLIO_LINKS.URL_MAX_LENGTH).refine(isSafeExternalUrl, 'URL must be a safe external HTTP or HTTPS URL'),
  description: z.string().trim().min(1).max(PORTFOLIO_LINKS.DESCRIPTION_MAX_LENGTH).optional(),
});

export const portfolioLinkIdParamSchema = z.object({ id: objectIdSchema('portfolio link ID') });

export const deletePortfolioLinkQuerySchema = z.strictObject({
  expectedVersion: z.coerce.number().int().min(1),
});

export const portfolioLinkListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(PAGINATION.DEFAULT_PAGE).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const idempotencyKeySchema = z.string().trim().min(1).max(PORTFOLIO_LINKS.IDEMPOTENCY_KEY_MAX_LENGTH)
  .regex(/^[\x21-\x7e]+$/, 'Idempotency-Key must contain printable ASCII characters');

export const portfolioLinkResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  description: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const paginatedPortfolioLinksSchema = z.object({
  items: z.array(portfolioLinkResponseSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type CreatePortfolioLinkInput = z.infer<typeof createPortfolioLinkSchema>;
export type PortfolioLinkListQuery = z.infer<typeof portfolioLinkListQuerySchema>;
export type PortfolioLinkResponse = z.infer<typeof portfolioLinkResponseSchema>;
