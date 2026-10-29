import { z } from 'zod';

import { PAGINATION } from '../../shared/constants/pagination.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { isSafeExternalUrl } from '../certificate-links/certificate-links.schemas.js';
import { PORTFOLIO_LINKS, PORTFOLIO_LINK_MESSAGES } from './portfolio-links.constants.js';

const titleSchema = z.string().trim().min(1).max(PORTFOLIO_LINKS.TITLE_MAX_LENGTH);
const urlSchema = z.string().trim().max(PORTFOLIO_LINKS.URL_MAX_LENGTH).refine(isSafeExternalUrl, 'URL must be a safe external HTTP or HTTPS URL');
const descriptionSchema = z.string().trim().min(1).max(PORTFOLIO_LINKS.DESCRIPTION_MAX_LENGTH);

export const createPortfolioLinkSchema = z.strictObject({
  title: titleSchema,
  url: urlSchema,
  description: descriptionSchema.optional(),
});

// A form that clears the field sends "" (or only spaces); null says the same. Both remove the description.
const clearableDescriptionSchema = z.string().trim().max(PORTFOLIO_LINKS.DESCRIPTION_MAX_LENGTH).transform((value) => (value === '' ? null : value));

// UC-S4-PORT-02: only title, URL and description can change. A field that is left out keeps its value; a null
// or empty description removes it. expectedVersion is the version the Candidate was editing.
export const updatePortfolioLinkSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  title: titleSchema.optional(),
  url: urlSchema.optional(),
  description: clearableDescriptionSchema.nullable().optional(),
}).refine((body) => body.title !== undefined || body.url !== undefined || body.description !== undefined, { message: PORTFOLIO_LINK_MESSAGES.NO_CHANGES });

export const portfolioLinkIdParamSchema = z.object({ id: objectIdSchema('portfolio link ID') });

export const deletePortfolioLinkQuerySchema = z.strictObject({
  expectedVersion: z.coerce.number().int().min(1),
});

export const portfolioLinkListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(PAGINATION.DEFAULT_PAGE).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // UC-S4-PORT-06: matches the stored title, URL or description only, never the external page.
  keyword: z.string().trim().min(1).max(PORTFOLIO_LINKS.KEYWORD_MAX_LENGTH).optional(),
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
export type UpdatePortfolioLinkInput = z.infer<typeof updatePortfolioLinkSchema>;
export type PortfolioLinkListQuery = z.infer<typeof portfolioLinkListQuerySchema>;
export type PortfolioLinkResponse = z.infer<typeof portfolioLinkResponseSchema>;
