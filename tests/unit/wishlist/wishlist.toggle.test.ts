import { Types } from 'mongoose';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Enterprise } from '../../../src/models/enterprise.model.js';
import { JobPosting } from '../../../src/models/job-posting.model.js';
import { WISHLIST_CONFIG, WISHLIST_MESSAGES } from '../../../src/modules/wishlist/wishlist.constants.js';
import { WishlistController } from '../../../src/modules/wishlist/wishlist.controller.js';
import type { WishlistRepository } from '../../../src/modules/wishlist/wishlist.repository.js';
import { WishlistService } from '../../../src/modules/wishlist/wishlist.service.js';

describe('Wishlist Update/Toggle Operations (PR 3)', () => {
  const userId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();
  const enterpriseId = new Types.ObjectId();

  const mockRepo = {
    create: vi.fn(),
    findByUserAndJob: vi.fn(),
    deleteByUserAndJob: vi.fn(),
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

  describe('WishlistService.toggleSave', () => {
    it('removes bookmark when job is already saved', async () => {
      mockRepo.findByUserAndJob.mockResolvedValue({ _id: new Types.ObjectId() });
      mockRepo.deleteByUserAndJob.mockResolvedValue(true);

      const result = await service.toggleSave(userId, jobId);
      expect(result).toEqual({
        saved: false,
        message: WISHLIST_MESSAGES.UNSAVED_SUCCESS,
      });
      expect(mockRepo.deleteByUserAndJob).toHaveBeenCalledWith(userId, jobId);
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('adds bookmark when job is not yet saved and valid', async () => {
      const createdId = new Types.ObjectId();
      mockRepo.findByUserAndJob.mockResolvedValue(null);
      mockRepo.countByUser.mockResolvedValue(5);
      mockRepo.create.mockResolvedValue({ _id: createdId });

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          status: 'published',
          enterprise_id: enterpriseId,
        }),
      } as unknown as ReturnType<typeof JobPosting.findById>);

      vi.spyOn(Enterprise, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          status: 'active',
          is_deleted: false,
        }),
      } as unknown as ReturnType<typeof Enterprise.findById>);

      const result = await service.toggleSave(userId, jobId);
      expect(result).toEqual({
        saved: true,
        message: WISHLIST_MESSAGES.SAVED_SUCCESS,
        id: createdId.toHexString(),
      });
      expect(mockRepo.create).toHaveBeenCalledWith(userId, jobId);
    });

    it('throws 409 Conflict when toggling to save at capacity 500', async () => {
      mockRepo.findByUserAndJob.mockResolvedValue(null);
      mockRepo.countByUser.mockResolvedValue(WISHLIST_CONFIG.MAX_CAPACITY);

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          status: 'published',
          enterprise_id: enterpriseId,
        }),
      } as unknown as ReturnType<typeof JobPosting.findById>);

      vi.spyOn(Enterprise, 'findById').mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          status: 'active',
          is_deleted: false,
        }),
      } as unknown as ReturnType<typeof Enterprise.findById>);

      await expect(service.toggleSave(userId, jobId)).rejects.toMatchObject({
        statusCode: 409,
        message: WISHLIST_MESSAGES.CAPACITY_EXCEEDED,
      });
    });
  });

  describe('WishlistController.toggleJob', () => {
    it('handles toggle from params (PATCH /jobs/:jobId/toggle)', async () => {
      const req = {
        user: { id: userId, email: 'cand@test.com', role: 'user', authVersion: 0 },
      } as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        locals: {
          validated: {
            params: { jobId },
          },
        },
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      vi.spyOn(service, 'toggleSave').mockResolvedValue({
        saved: true,
        message: 'Job added to wishlist successfully',
        id: 'some-id',
      });

      await controller.toggleJob(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        saved: true,
        message: 'Job added to wishlist successfully',
        id: 'some-id',
      });
    });

    it('handles toggle from body (POST /toggle)', async () => {
      const req = {
        user: { id: userId, email: 'cand@test.com', role: 'user', authVersion: 0 },
      } as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        locals: {
          validated: {
            body: { jobId },
          },
        },
      } as unknown as Response;

      const next = vi.fn() as NextFunction;

      vi.spyOn(service, 'toggleSave').mockResolvedValue({
        saved: false,
        message: 'Job removed from wishlist',
      });

      await controller.toggleJob(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        saved: false,
        message: 'Job removed from wishlist',
      });
    });
  });
});
