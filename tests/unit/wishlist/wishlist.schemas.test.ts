import { describe, expect, it } from 'vitest';

import {
  addWishlistBodySchema,
  wishlistBulkDeleteResponseSchema,
  wishlistDeleteResponseSchema,
  wishlistIdParamSchema,
  wishlistSaveResponseSchema,
} from '../../../src/modules/wishlist/wishlist.schemas.js';

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

  describe('wishlistIdParamSchema', () => {
    it('accepts valid 24-character hexadecimal id', () => {
      const valid = { id: '507f1f77bcf86cd799439011' };
      const parsed = wishlistIdParamSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid id format', () => {
      const invalid = { id: 'invalid-id' };
      const parsed = wishlistIdParamSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe('wishlistDeleteResponseSchema & wishlistBulkDeleteResponseSchema', () => {
    it('parses valid delete responses with idempotency flags', () => {
      const res = wishlistDeleteResponseSchema.safeParse({
        removed: true,
        alreadyRemoved: true,
        message: 'This job is no longer in your saved jobs',
      });
      expect(res.success).toBe(true);
    });

    it('parses valid bulk delete responses', () => {
      const res = wishlistBulkDeleteResponseSchema.safeParse({
        removedCount: 5,
        message: 'Unavailable saved jobs cleared successfully',
      });
      expect(res.success).toBe(true);
    });
  });
});
