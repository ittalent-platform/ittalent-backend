import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Enterprise } from '../../../src/models/enterprise.model.js';
import { JobPosting } from '../../../src/models/job-posting.model.js';
import { WISHLIST_CONFIG, WISHLIST_MESSAGES } from '../../../src/modules/wishlist/wishlist.constants.js';
import type { WishlistRepository } from '../../../src/modules/wishlist/wishlist.repository.js';
import { WishlistService } from '../../../src/modules/wishlist/wishlist.service.js';

describe('WishlistService.saveJob', () => {
  const userId = new Types.ObjectId().toHexString();
  const jobId = new Types.ObjectId().toHexString();
  const enterpriseId = new Types.ObjectId();

  const mockRepo = {
    create: vi.fn(),
    findByUserAndJob: vi.fn(),
    countByUser: vi.fn(),
  };

  let service: WishlistService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new WishlistService(mockRepo as unknown as WishlistRepository);
  });

  it('throws 404 when job posting does not exist', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    } as unknown as ReturnType<typeof JobPosting.findById>);

    await expect(service.saveJob(userId, jobId)).rejects.toMatchObject({
      statusCode: 404,
      message: WISHLIST_MESSAGES.JOB_NOT_FOUND,
    });
  });

  it('throws 400 when job posting is closed or draft', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        status: 'draft',
        enterprise_id: enterpriseId,
      }),
    } as unknown as ReturnType<typeof JobPosting.findById>);

    await expect(service.saveJob(userId, jobId)).rejects.toMatchObject({
      statusCode: 400,
      message: WISHLIST_MESSAGES.JOB_CLOSED,
    });
  });

  it('throws 400 when job posting has passed its expires_at date', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        status: 'published',
        expires_at: new Date(Date.now() - 60000), // 1 min ago
        enterprise_id: enterpriseId,
      }),
    } as unknown as ReturnType<typeof JobPosting.findById>);

    await expect(service.saveJob(userId, jobId)).rejects.toMatchObject({
      statusCode: 400,
      message: WISHLIST_MESSAGES.JOB_CLOSED,
    });
  });

  it('throws 400 when enterprise is inactive or deleted', async () => {
    vi.spyOn(JobPosting, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        status: 'published',
        enterprise_id: enterpriseId,
      }),
    } as unknown as ReturnType<typeof JobPosting.findById>);

    vi.spyOn(Enterprise, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        status: 'inactive',
        is_deleted: false,
      }),
    } as unknown as ReturnType<typeof Enterprise.findById>);

    await expect(service.saveJob(userId, jobId)).rejects.toMatchObject({
      statusCode: 400,
      message: WISHLIST_MESSAGES.ENTERPRISE_INACTIVE,
    });
  });

  it('returns alreadySaved=true when job is already in wishlist (idempotent save)', async () => {
    const existingId = new Types.ObjectId();
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

    mockRepo.findByUserAndJob.mockResolvedValue({
      _id: existingId,
    });

    const result = await service.saveJob(userId, jobId);
    expect(result).toEqual({
      saved: true,
      alreadySaved: true,
      message: WISHLIST_MESSAGES.ALREADY_SAVED,
      id: existingId.toHexString(),
    });
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('throws 409 Conflict when wishlist capacity reaches 500 items', async () => {
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

    mockRepo.findByUserAndJob.mockResolvedValue(null);
    mockRepo.countByUser.mockResolvedValue(WISHLIST_CONFIG.MAX_CAPACITY);

    await expect(service.saveJob(userId, jobId)).rejects.toMatchObject({
      statusCode: 409,
      message: WISHLIST_MESSAGES.CAPACITY_EXCEEDED,
    });
  });

  it('creates and returns wishlist item successfully when validations pass', async () => {
    const newId = new Types.ObjectId();
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

    mockRepo.findByUserAndJob.mockResolvedValue(null);
    mockRepo.countByUser.mockResolvedValue(10);
    mockRepo.create.mockResolvedValue({ _id: newId });

    const result = await service.saveJob(userId, jobId);
    expect(result).toEqual({
      saved: true,
      alreadySaved: false,
      message: WISHLIST_MESSAGES.SAVED_SUCCESS,
      id: newId.toHexString(),
    });
  });
});
