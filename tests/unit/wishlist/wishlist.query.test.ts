import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WISHLIST_AVAILABILITY } from '../../../src/modules/wishlist/wishlist.constants.js';
import type { WishlistRepository } from '../../../src/modules/wishlist/wishlist.repository.js';
import { wishlistQuerySchema } from '../../../src/modules/wishlist/wishlist.schemas.js';
import { WishlistService } from '../../../src/modules/wishlist/wishlist.service.js';

describe('Wishlist Read Operations (PR 2)', () => {
  describe('wishlistQuerySchema', () => {
    it('applies defaults when empty query is provided', () => {
      const parsed = wishlistQuerySchema.parse({});
      expect(parsed).toEqual({
        page: 1,
        limit: 20,
        status: 'all',
      });
    });

    it('accepts valid keyword, status, and location filters', () => {
      const parsed = wishlistQuerySchema.parse({
        page: '2',
        limit: '15',
        q: 'Golang',
        status: 'available',
        location: 'Ha Noi',
      });
      expect(parsed).toEqual({
        page: 2,
        limit: 15,
        q: 'Golang',
        status: 'available',
        location: 'Ha Noi',
      });
    });

    it('rejects unsupported status values', () => {
      expect(wishlistQuerySchema.safeParse({ status: 'invalid_status' }).success).toBe(false);
    });

    it('rejects unsupported query parameters (strictObject per UX Board 12 E2)', () => {
      const res = wishlistQuerySchema.safeParse({ unsupportedKey: 'test' });
      expect(res.success).toBe(false);
    });
  });

  describe('WishlistService.checkSaved', () => {
    const mockRepo = {
      create: vi.fn(),
      findByUserAndJob: vi.fn(),
      countByUser: vi.fn(),
      findPaginatedWishlist: vi.fn(),
    };

    let service: WishlistService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new WishlistService(mockRepo as unknown as WishlistRepository);
    });

    it('returns isSaved=true and wishlistId when bookmarked', async () => {
      const savedId = new Types.ObjectId();
      mockRepo.findByUserAndJob.mockResolvedValue({ _id: savedId });

      const res = await service.checkSaved('u1', 'j1');
      expect(res).toEqual({
        isSaved: true,
        wishlistId: savedId.toHexString(),
      });
    });

    it('returns isSaved=false and wishlistId=null when not bookmarked', async () => {
      mockRepo.findByUserAndJob.mockResolvedValue(null);

      const res = await service.checkSaved('u1', 'j1');
      expect(res).toEqual({
        isSaved: false,
        wishlistId: null,
      });
    });
  });

  describe('WishlistService.listMine', () => {
    const mockRepo = {
      create: vi.fn(),
      findByUserAndJob: vi.fn(),
      countByUser: vi.fn(),
      findPaginatedWishlist: vi.fn(),
    };

    let service: WishlistService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new WishlistService(mockRepo as unknown as WishlistRepository);
    });

    it('maps available jobs with full public fields and calculates isClosingSoon', async () => {
      const id1 = new Types.ObjectId();
      const jobId1 = new Types.ObjectId();
      const entId1 = new Types.ObjectId();
      const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

      mockRepo.findPaginatedWishlist.mockResolvedValue({
        items: [
          {
            _id: id1,
            user_id: new Types.ObjectId(),
            job_id: jobId1,
            createdAt: new Date('2026-10-20T10:00:00.000Z'),
            updatedAt: new Date('2026-10-20T10:00:00.000Z'),
            is_available: true,
            job: {
              _id: jobId1,
              title: 'Senior DevOps Engineer',
              slug: 'senior-devops-engineer',
              location: 'Ho Chi Minh City · On-site',
              employment_type: 'Full-time',
              level: 'Senior',
              salary_min: 30000000,
              salary_max: 45000000,
              salary_negotiable: false,
              currency: 'VND',
              expires_at: twoDaysFromNow,
              status: 'published',
            },
            enterprise: {
              _id: entId1,
              name: 'Orbit Games',
              logo_url: 'https://cdn.example.com/logo.png',
            },
          },
        ],
        total: 1,
      });

      const res = await service.listMine('user1', { page: 1, limit: 20, status: 'all' });
      expect(res.total).toBe(1);
      expect(res.items[0]).toMatchObject({
        id: id1.toHexString(),
        jobId: jobId1.toHexString(),
        availability: WISHLIST_AVAILABILITY.AVAILABLE,
        isClosingSoon: true, // within 72h
        title: 'Senior DevOps Engineer',
        enterprise: {
          id: entId1.toHexString(),
          name: 'Orbit Games',
          logoUrl: 'https://cdn.example.com/logo.png',
        },
        salaryMin: 30000000,
        salaryMax: 45000000,
      });
    });

    it('masks sensitive fields for unavailable jobs (UX Board 6 & 11 WL-02 A2)', async () => {
      const id2 = new Types.ObjectId();
      const jobId2 = new Types.ObjectId();

      mockRepo.findPaginatedWishlist.mockResolvedValue({
        items: [
          {
            _id: id2,
            user_id: new Types.ObjectId(),
            job_id: jobId2,
            createdAt: new Date('2026-09-12T00:00:00.000Z'),
            updatedAt: new Date('2026-09-12T00:00:00.000Z'),
            is_available: false,
            job: {
              _id: jobId2,
              title: 'Secret Archived Role',
              slug: 'secret-archived-role',
              status: 'closed',
            },
          },
        ],
        total: 1,
      });

      const res = await service.listMine('user1', { page: 1, limit: 20, status: 'all' });
      expect(res.items[0]).toEqual({
        id: id2.toHexString(),
        jobId: jobId2.toHexString(),
        savedAt: '2026-09-12T00:00:00.000Z',
        availability: WISHLIST_AVAILABILITY.UNAVAILABLE,
        isClosingSoon: false,
        title: null,
        slug: null,
        enterprise: null,
        location: null,
        employmentType: null,
        level: null,
        salaryMin: null,
        salaryMax: null,
        salaryNegotiable: false,
        currency: 'VND',
        expiresAt: null,
      });
    });
  });
});
