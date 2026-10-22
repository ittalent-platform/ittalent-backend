import { Enterprise } from '../../models/enterprise.model.js';
import { JobPosting } from '../../models/job-posting.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { WISHLIST_AVAILABILITY, WISHLIST_CONFIG, WISHLIST_MESSAGES } from './wishlist.constants.js';
import { wishlistRepository, type WishlistRepository } from './wishlist.repository.js';
import type {
  WishlistCheckResponse,
  WishlistItem,
  WishlistQuery,
  WishlistResponse,
  WishlistSaveResponse,
} from './wishlist.schemas.js';

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

  async checkSaved(userId: string, jobId: string): Promise<WishlistCheckResponse> {
    const existing = await this.repo.findByUserAndJob(userId, jobId);
    return {
      isSaved: Boolean(existing),
      wishlistId: existing ? existing._id.toHexString() : null,
    };
  }

  async listMine(userId: string, query: WishlistQuery): Promise<WishlistResponse> {
    const { items: rawItems, total } = await this.repo.findPaginatedWishlist(userId, query);
    const nowMs = Date.now();

    const items: WishlistItem[] = rawItems.map((raw) => {
      const isAvailable = Boolean(raw.is_available && raw.job);

      if (isAvailable && raw.job) {
        const expiresAtDate = raw.job.expires_at ? new Date(raw.job.expires_at) : null;
        const diffMs = expiresAtDate ? expiresAtDate.getTime() - nowMs : Infinity;
        const isClosingSoon = diffMs > 0 && diffMs <= WISHLIST_CONFIG.CLOSING_SOON_THRESHOLD_MS;

        return {
          id: raw._id.toHexString(),
          jobId: raw.job_id.toHexString(),
          savedAt: raw.createdAt.toISOString(),
          availability: WISHLIST_AVAILABILITY.AVAILABLE,
          isClosingSoon,
          title: raw.job.title,
          slug: raw.job.slug,
          enterprise: raw.enterprise
            ? {
                id: raw.enterprise._id.toHexString(),
                name: raw.enterprise.name,
                logoUrl: raw.enterprise.logo_url ?? null,
              }
            : null,
          location: raw.job.location ?? null,
          employmentType: raw.job.employment_type ?? null,
          level: raw.job.level ?? null,
          salaryMin: raw.job.salary_min ?? null,
          salaryMax: raw.job.salary_max ?? null,
          salaryNegotiable: raw.job.salary_negotiable ?? false,
          currency: raw.job.currency ?? 'VND',
          expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
        };
      }

      // UX Board 6 & 11 (WL-02 A2): Placeholder for unavailable/closed/inactive jobs with masked sensitive details
      return {
        id: raw._id.toHexString(),
        jobId: raw.job_id.toHexString(),
        savedAt: raw.createdAt.toISOString(),
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
      };
    });

    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    };
  }
}

export const wishlistService = new WishlistService();
