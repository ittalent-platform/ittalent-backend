import { describe, expect, it } from 'vitest';

import { addWishlistBodySchema, wishlistSaveResponseSchema } from '../../../src/modules/wishlist/wishlist.schemas.js';

describe('wishlist schemas (PR 1 - Create)', () => {
  describe('addWishlistBodySchema', () => {
    it('accepts valid 24-character hexadecimal jobId', () => {
      const valid = { jobId: '507f1f77bcf86cd799439011' };
      const parsed = addWishlistBodySchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid jobId format', () => {
      const invalid = { jobId: 'not-an-id' };
      const parsed = addWishlistBodySchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it('rejects unknown payload keys (strictObject)', () => {
      const extra = { jobId: '507f1f77bcf86cd799439011', extraField: 'unexpected' };
      const parsed = addWishlistBodySchema.safeParse(extra);
      expect(parsed.success).toBe(false);
    });
  });

  describe('wishlistSaveResponseSchema', () => {
    it('parses valid save response with and without alreadySaved flag', () => {
      const res1 = wishlistSaveResponseSchema.safeParse({
        saved: true,
        alreadySaved: false,
        message: 'Job added to wishlist successfully',
        id: '507f1f77bcf86cd799439011',
      });
      expect(res1.success).toBe(true);

      const res2 = wishlistSaveResponseSchema.safeParse({
        saved: true,
        alreadySaved: true,
        message: 'Already in your saved jobs',
      });
      expect(res2.success).toBe(true);
    });
  });
});
