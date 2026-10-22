import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WishlistController } from '../../../src/modules/wishlist/wishlist.controller.js';
import type { WishlistService } from '../../../src/modules/wishlist/wishlist.service.js';

describe('WishlistController.saveJob', () => {
  const mockService = {
    saveJob: vi.fn(),
  };

  let controller: WishlistController;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new WishlistController(mockService as unknown as WishlistService);

    req = {
      user: { id: '507f1f77bcf86cd799439011', email: 'test@example.com', role: 'user', authVersion: 0 },
    };

    const statusFn = vi.fn().mockReturnThis();
    const jsonFn = vi.fn().mockReturnThis();

    res = {
      status: statusFn,
      json: jsonFn,
      locals: {
        validated: {
          body: { jobId: '507f1f77bcf86cd799439022' },
        },
      },
    };

    next = vi.fn();
  });

  it('responds with 201 Created when newly added', async () => {
    mockService.saveJob.mockResolvedValue({
      saved: true,
      alreadySaved: false,
      message: 'Job added to wishlist successfully',
      id: '507f1f77bcf86cd799439033',
    });

    await controller.saveJob(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      saved: true,
      alreadySaved: false,
      message: 'Job added to wishlist successfully',
      id: '507f1f77bcf86cd799439033',
    });
  });

  it('responds with 200 OK when already saved', async () => {
    mockService.saveJob.mockResolvedValue({
      saved: true,
      alreadySaved: true,
      message: 'Already in your saved jobs',
      id: '507f1f77bcf86cd799439033',
    });

    await controller.saveJob(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      saved: true,
      alreadySaved: true,
      message: 'Already in your saved jobs',
      id: '507f1f77bcf86cd799439033',
    });
  });

  it('calls next(error) if service throws', async () => {
    const error = new Error('Service error');
    mockService.saveJob.mockRejectedValue(error);

    await controller.saveJob(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
