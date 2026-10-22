import { Types } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WISHLIST_MESSAGES } from '../../../src/modules/wishlist/wishlist.constants.js';
import { WishlistController } from '../../../src/modules/wishlist/wishlist.controller.js';
import type { WishlistRepository } from '../../../src/modules/wishlist/wishlist.repository.js';
import { WishlistService } from '../../../src/modules/wishlist/wishlist.service.js';

describe('Wishlist Delete Operations (PR 4)', () => {
  const userId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();
  const wishlistId = new Types.ObjectId().toHexString();

  const mockRepo = {
    create: vi.fn(),
    findByUserAndJob: vi.fn(),
    deleteByUserAndJob: vi.fn(),
    deleteByIdAndUser: vi.fn(),
    deleteUnavailableByUser: vi.fn(),
    countByUser: vi.fn(),
    findPaginatedWishlist: vi.fn(),
  };

  let service: WishlistService;
  let controller: WishlistController;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WishlistService(mockRepo as unknown as WishlistRepository);
    controller = new WishlistController(service);
  });

  describe('WishlistService.removeJob', () => {
    it('returns 200 payload with alreadyRemoved=false when job successfully removed', async () => {
      mockRepo.deleteByUserAndJob.mockResolvedValue(true);

      const result = await service.removeJob(userId, jobId);
      expect(result).toEqual({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });
      expect(mockRepo.deleteByUserAndJob).toHaveBeenCalledWith(userId, jobId);
    });

    it('returns 200 idempotent payload when job was already deleted in another tab (Board 11 WL-03 A3)', async () => {
      mockRepo.deleteByUserAndJob.mockResolvedValue(false);

      const result = await service.removeJob(userId, jobId);
      expect(result).toEqual({
        removed: true,
        alreadyRemoved: true,
        message: WISHLIST_MESSAGES.ALREADY_REMOVED,
      });
      expect(mockRepo.deleteByUserAndJob).toHaveBeenCalledWith(userId, jobId);
    });
  });

  describe('WishlistService.removeById', () => {
    it('returns 200 payload when record successfully removed by wishlist record ID', async () => {
      mockRepo.deleteByIdAndUser.mockResolvedValue(true);

      const result = await service.removeById(userId, wishlistId);
      expect(result).toEqual({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });
      expect(mockRepo.deleteByIdAndUser).toHaveBeenCalledWith(userId, wishlistId);
    });

    it('returns 200 idempotent payload when record was already removed', async () => {
      mockRepo.deleteByIdAndUser.mockResolvedValue(false);

      const result = await service.removeById(userId, wishlistId);
      expect(result).toEqual({
        removed: true,
        alreadyRemoved: true,
        message: WISHLIST_MESSAGES.ALREADY_REMOVED,
      });
      expect(mockRepo.deleteByIdAndUser).toHaveBeenCalledWith(userId, wishlistId);
    });
  });

  describe('WishlistService.clearUnavailable', () => {
    it('returns removedCount when unavailable bookmarks are purged', async () => {
      const purgeCount = 3;
      mockRepo.deleteUnavailableByUser.mockResolvedValue(purgeCount);

      const result = await service.clearUnavailable(userId);
      expect(result).toEqual({
        removedCount: purgeCount,
        message: WISHLIST_MESSAGES.BULK_REMOVED_SUCCESS,
      });
      expect(mockRepo.deleteUnavailableByUser).toHaveBeenCalledWith(userId);
    });
  });

  describe('WishlistController Delete Endpoints', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        user: { id: userId, email: 'cand@test.com', role: 'user' },
      };
      mockRes = {
        locals: {},
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };
      mockNext = vi.fn();
    });

    it('removeJob throws 401 when user is unauthenticated', async () => {
      delete mockReq.user;
      await controller.removeJob(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          message: WISHLIST_MESSAGES.AUTH_REQUIRED,
        }),
      );
    });

    it('removeJob returns 200 with service result', async () => {
      mockRes.locals = { validated: { params: { jobId } } };
      vi.spyOn(service, 'removeJob').mockResolvedValue({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });

      await controller.removeJob(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });
    });

    it('removeById returns 200 with service result', async () => {
      mockRes.locals = { validated: { params: { id: wishlistId } } };
      vi.spyOn(service, 'removeById').mockResolvedValue({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });

      await controller.removeById(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        removed: true,
        alreadyRemoved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });
    });

    it('clearUnavailable returns 200 with bulk delete count', async () => {
      vi.spyOn(service, 'clearUnavailable').mockResolvedValue({
        removedCount: 2,
        message: WISHLIST_MESSAGES.BULK_REMOVED_SUCCESS,
      });

      await controller.clearUnavailable(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        removedCount: 2,
        message: WISHLIST_MESSAGES.BULK_REMOVED_SUCCESS,
      });
    });
  });
});
