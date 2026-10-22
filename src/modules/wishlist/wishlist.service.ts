import { Enterprise } from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { WISHLIST_CONFIG, WISHLIST_MESSAGES } from './wishlist.constants.js';
import { wishlistRepository, type WishlistRepository } from './wishlist.repository.js';
import type { WishlistSaveResponse } from './wishlist.schemas.js';

export class WishlistService {
  constructor(private readonly repo: WishlistRepository = wishlistRepository) {}

  async saveJob(userId: string, jobId: string): Promise<WishlistSaveResponse> {
    const job = await JobPosting.findById(jobId).exec();
    if (!job) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, WISHLIST_MESSAGES.JOB_NOT_FOUND);
    }

    const now = new Date();
    const isExpired = job.expires_at ? job.expires_at <= now : false;
    if (job.status !== 'published' || job.deleting || isExpired) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, WISHLIST_MESSAGES.JOB_CLOSED);
    }

    const enterprise = await Enterprise.findById(job.enterprise_id).exec();
    if (!enterprise || enterprise.status !== 'active' || enterprise.is_deleted) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, WISHLIST_MESSAGES.ENTERPRISE_INACTIVE);
    }

    const existing = await this.repo.findByUserAndJob(userId, jobId);
    if (existing) {
      return {
        saved: true,
        alreadySaved: true,
        message: WISHLIST_MESSAGES.ALREADY_SAVED,
        id: existing._id.toHexString(),
      };
    }

    const count = await this.repo.countByUser(userId);
    if (count >= WISHLIST_CONFIG.MAX_CAPACITY) {
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, WISHLIST_MESSAGES.CAPACITY_EXCEEDED);
    }

    try {
      const created = await this.repo.create(userId, jobId);
      return {
        saved: true,
        alreadySaved: false,
        message: WISHLIST_MESSAGES.SAVED_SUCCESS,
        id: created._id.toHexString(),
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: number }).code === WISHLIST_CONFIG.MONGO_DUPLICATE_KEY_ERROR_CODE
      ) {
        const raced = await this.repo.findByUserAndJob(userId, jobId);
        return {
          saved: true,
          alreadySaved: true,
          message: WISHLIST_MESSAGES.ALREADY_SAVED,
          id: raced?._id.toHexString(),
        };
      }
      throw error;
    }
  }
}

export const wishlistService = new WishlistService();
