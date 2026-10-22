import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';

export const addWishlistBodySchema = z.strictObject({
  jobId: objectIdSchema('job ID'),
});

export type AddWishlistBody = z.infer<typeof addWishlistBodySchema>;

export const wishlistSaveResponseSchema = z.object({
  saved: z.boolean(),
  alreadySaved: z.boolean().optional(),
  message: z.string(),
  id: z.string().optional(),
});

export type WishlistSaveResponse = z.infer<typeof wishlistSaveResponseSchema>;
