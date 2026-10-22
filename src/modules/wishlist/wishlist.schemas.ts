import { z } from 'zod';

import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { WISHLIST_AVAILABILITY, WISHLIST_CONFIG, WISHLIST_STATUS_FILTERS } from './wishlist.constants.js';

export const addWishlistBodySchema = z.strictObject({
  jobId: objectIdSchema('job ID'),
});

export type AddWishlistBody = z.infer<typeof addWishlistBodySchema>;

export const wishlistJobParamSchema = z.strictObject({
  jobId: objectIdSchema('job ID'),
});

export type WishlistJobParam = z.infer<typeof wishlistJobParamSchema>;

export const wishlistSaveResponseSchema = z.object({
  saved: z.boolean(),
  alreadySaved: z.boolean().optional(),
  message: z.string(),
  id: z.string().optional(),
});

export type WishlistSaveResponse = z.infer<typeof wishlistSaveResponseSchema>;

export const wishlistCheckResponseSchema = z.object({
  isSaved: z.boolean(),
  wishlistId: z.string().nullable().optional(),
});

export type WishlistCheckResponse = z.infer<typeof wishlistCheckResponseSchema>;

export const wishlistQuerySchema = z.strictObject({
  ...paginationQueryShape,
  q: z.string().trim().min(1).max(WISHLIST_CONFIG.KEYWORD_MAX_LENGTH).optional(),
  status: z.enum(WISHLIST_STATUS_FILTERS).default('all'),
  location: z.string().trim().min(1).max(WISHLIST_CONFIG.LOCATION_MAX_LENGTH).optional(),
});

export type WishlistQuery = z.infer<typeof wishlistQuerySchema>;

export const wishlistEnterpriseSchema = z.object({
  id: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable().optional(),
});

export type WishlistEnterprise = z.infer<typeof wishlistEnterpriseSchema>;

export const wishlistItemSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  savedAt: z.string(),
  availability: z.enum([WISHLIST_AVAILABILITY.AVAILABLE, WISHLIST_AVAILABILITY.UNAVAILABLE]),
  isClosingSoon: z.boolean().optional(),
  title: z.string().nullable(),
  slug: z.string().nullable(),
  enterprise: wishlistEnterpriseSchema.nullable(),
  location: z.string().nullable(),
  employmentType: z.string().nullable(),
  level: z.string().nullable(),
  salaryMin: z.number().nullable().optional(),
  salaryMax: z.number().nullable().optional(),
  salaryNegotiable: z.boolean().optional(),
  currency: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

export type WishlistItem = z.infer<typeof wishlistItemSchema>;

export const wishlistResponseSchema = paginatedResponseSchema(wishlistItemSchema);
export type WishlistResponse = z.infer<typeof wishlistResponseSchema>;
