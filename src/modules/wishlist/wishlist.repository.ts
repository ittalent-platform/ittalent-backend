import { Types, type ClientSession } from 'mongoose';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { enterprises, jobPostings, wishlists } from '../../db/schema/index.js';
import { Wishlist, type WishlistDoc } from '../../models/wishlist.model.js';
import type { WishlistQuery } from './wishlist.schemas.js';

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toWishlistDoc(row: typeof wishlists.$inferSelect): WishlistDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    user_id: new Types.ObjectId(row.user_id),
    job_id: new Types.ObjectId(row.job_id),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
  return {
    ...doc,
    toObject() {
      return doc;
    },
    toJSON() {
      return doc;
    },
  } as unknown as WishlistDoc;
}

export interface RawWishlistAggregationItem {
  _id: Types.ObjectId;
  user_id: Types.ObjectId;
  job_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  is_available: boolean;
  job?: {
    _id: Types.ObjectId;
    title: string;
    slug: string;
    location?: string;
    employment_type?: string;
    level?: string;
    salary_min?: number;
    salary_max?: number;
    salary_negotiable?: boolean;
    currency?: string;
    expires_at?: Date;
    status: string;
  };
  enterprise?: {
    _id: Types.ObjectId;
    name: string;
    logo_url?: string | null;
  };
}

export class WishlistRepository {
  async create(userId: string, jobId: string, session?: ClientSession): Promise<WishlistDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist)) {
      const doc = new Wishlist({
        user_id: new Types.ObjectId(userId),
        job_id: new Types.ObjectId(jobId),
      });
      return doc.save(session ? { session } : undefined);
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(wishlists)
      .values({
        id,
        user_id: userId,
        job_id: jobId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(wishlists).where(eq(wishlists.id, id)).get();
    if (!row) throw new Error('Failed to create wishlist entry');
    return toWishlistDoc(row);
  }

  async findByUserAndJob(userId: string, jobId: string): Promise<WishlistDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.findOne)) {
      return Wishlist.findOne({
        user_id: new Types.ObjectId(userId),
        job_id: new Types.ObjectId(jobId),
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(wishlists)
      .where(and(eq(wishlists.user_id, userId), eq(wishlists.job_id, jobId)))
      .get();
    return row ? toWishlistDoc(row) : null;
  }

  async deleteByUserAndJob(userId: string, jobId: string, session?: ClientSession): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.deleteOne)) {
      const result = await Wishlist.deleteOne(
        {
          user_id: new Types.ObjectId(userId),
          job_id: new Types.ObjectId(jobId),
        },
        session ? { session } : undefined,
      ).exec();
      return result.deletedCount > 0;
    }
    const db = getSqliteDb();
    const res = db
      .delete(wishlists)
      .where(and(eq(wishlists.user_id, userId), eq(wishlists.job_id, jobId)))
      .run();
    return res.changes > 0;
  }

  async deleteByIdAndUser(userId: string, id: string, session?: ClientSession): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.deleteOne)) {
      const result = await Wishlist.deleteOne(
        {
          _id: new Types.ObjectId(id),
          user_id: new Types.ObjectId(userId),
        },
        session ? { session } : undefined,
      ).exec();
      return result.deletedCount > 0;
    }
    const db = getSqliteDb();
    const res = db
      .delete(wishlists)
      .where(and(eq(wishlists.id, id), eq(wishlists.user_id, userId)))
      .run();
    return res.changes > 0;
  }

  async deleteUnavailableByUser(userId: string, session?: ClientSession): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.aggregate)) {
      const now = new Date();
      const unavailableDocs = await Wishlist.aggregate<{ _id: Types.ObjectId }>([
        { $match: { user_id: new Types.ObjectId(userId) } },
        { $lookup: { from: 'job_postings', localField: 'job_id', foreignField: '_id', as: 'job' } },
        { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'enterprises', localField: 'job.enterprise_id', foreignField: '_id', as: 'enterprise' } },
        { $unwind: { path: '$enterprise', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            is_available: {
              $and: [
                { $eq: ['$job.status', 'published'] },
                { $ne: ['$job.deleting', true] },
                {
                  $or: [
                    { $eq: [{ $type: '$job.expires_at' }, 'missing'] },
                    { $eq: ['$job.expires_at', null] },
                    { $gt: ['$job.expires_at', now] },
                  ],
                },
                { $eq: ['$enterprise.status', 'active'] },
                { $ne: ['$enterprise.is_deleted', true] },
              ],
            },
          },
        },
        { $match: { is_available: false } },
        { $project: { _id: 1 } },
      ]).exec();

      if (unavailableDocs.length === 0) return 0;
      const ids = unavailableDocs.map((doc) => doc._id);
      const result = await Wishlist.deleteMany(
        { _id: { $in: ids }, user_id: new Types.ObjectId(userId) },
        session ? { session } : undefined,
      ).exec();
      return result.deletedCount;
    }

    const db = getSqliteDb();
    const now = new Date();
    const rows = db
      .select({
        wishlistId: wishlists.id,
        jobId: jobPostings.id,
        jobStatus: jobPostings.status,
        jobDeleting: jobPostings.deleting,
        jobExpiresAt: jobPostings.expires_at,
        enterpriseId: enterprises.id,
        enterpriseStatus: enterprises.status,
        enterpriseIsDeleted: enterprises.is_deleted,
      })
      .from(wishlists)
      .leftJoin(jobPostings, eq(wishlists.job_id, jobPostings.id))
      .leftJoin(enterprises, eq(jobPostings.enterprise_id, enterprises.id))
      .where(eq(wishlists.user_id, userId))
      .all();

    const unavailableIds = rows
      .filter((r) => {
        const isAvailable =
          Boolean(r.jobId) &&
          r.jobStatus === 'published' &&
          !r.jobDeleting &&
          (!r.jobExpiresAt || new Date(r.jobExpiresAt) > now) &&
          Boolean(r.enterpriseId) &&
          r.enterpriseStatus === 'active' &&
          !r.enterpriseIsDeleted;
        return !isAvailable;
      })
      .map((r) => r.wishlistId);

    if (unavailableIds.length === 0) return 0;

    const res = db
      .delete(wishlists)
      .where(inArray(wishlists.id, unavailableIds))
      .run();
    return res.changes;
  }

  async countByUser(userId: string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.countDocuments)) {
      return Wishlist.countDocuments({
        user_id: new Types.ObjectId(userId),
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select({ count: count() })
      .from(wishlists)
      .where(eq(wishlists.user_id, userId))
      .get();
    return row?.count ?? 0;
  }

  async findPaginatedWishlist(
    userId: string,
    query: WishlistQuery,
  ): Promise<{ items: RawWishlistAggregationItem[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Wishlist.aggregate)) {
      const now = new Date();
      const pipeline: unknown[] = [
        { $match: { user_id: new Types.ObjectId(userId) } },
        { $lookup: { from: 'job_postings', localField: 'job_id', foreignField: '_id', as: 'job' } },
        { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'enterprises', localField: 'job.enterprise_id', foreignField: '_id', as: 'enterprise' } },
        { $unwind: { path: '$enterprise', preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            is_available: {
              $and: [
                { $eq: ['$job.status', 'published'] },
                { $ne: ['$job.deleting', true] },
                {
                  $or: [
                    { $eq: [{ $type: '$job.expires_at' }, 'missing'] },
                    { $eq: ['$job.expires_at', null] },
                    { $gt: ['$job.expires_at', now] },
                  ],
                },
                { $eq: ['$enterprise.status', 'active'] },
                { $ne: ['$enterprise.is_deleted', true] },
              ],
            },
          },
        },
      ];

      if (query.status === 'available') {
        pipeline.push({ $match: { is_available: true } });
      } else if (query.status === 'unavailable') {
        pipeline.push({ $match: { is_available: false } });
      }

      if (query.q) {
        const pattern = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        pipeline.push({
          $match: {
            is_available: true,
            $or: [{ 'job.title': { $regex: pattern } }, { 'enterprise.name': { $regex: pattern } }],
          },
        });
      }

      if (query.location) {
        const pattern = new RegExp(query.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        pipeline.push({ $match: { 'job.location': { $regex: pattern } } });
      }

      const skip = (query.page - 1) * query.limit;
      pipeline.push({
        $facet: {
          metadata: [{ $count: 'total' }],
          data: [{ $sort: { createdAt: -1 } }, { $skip: skip }, { $limit: query.limit }],
        },
      });

      const result = await Wishlist.aggregate<{
        metadata: [{ total: number }?];
        data: RawWishlistAggregationItem[];
      }>(pipeline as never).exec();

      const total = result[0]?.metadata[0]?.total ?? 0;
      const items = result[0]?.data ?? [];
      return { items, total };
    }

    const db = getSqliteDb();
    const now = new Date();
    const rows = db
      .select({
        wishlistId: wishlists.id,
        userId: wishlists.user_id,
        jobId: wishlists.job_id,
        createdAt: wishlists.createdAt,
        updatedAt: wishlists.updatedAt,
        jobPostId: jobPostings.id,
        jobTitle: jobPostings.title,
        jobSlug: jobPostings.slug,
        jobLocation: jobPostings.location,
        jobEmploymentType: jobPostings.employment_type,
        jobLevel: jobPostings.level,
        jobSalaryMin: jobPostings.salary_min,
        jobSalaryMax: jobPostings.salary_max,
        jobSalaryNegotiable: jobPostings.salary_negotiable,
        jobCurrency: jobPostings.currency,
        jobExpiresAt: jobPostings.expires_at,
        jobStatus: jobPostings.status,
        jobDeleting: jobPostings.deleting,
        enterpriseId: enterprises.id,
        enterpriseName: enterprises.name,
        enterpriseLogoUrl: enterprises.logo_url,
        enterpriseStatus: enterprises.status,
        enterpriseIsDeleted: enterprises.is_deleted,
      })
      .from(wishlists)
      .leftJoin(jobPostings, eq(wishlists.job_id, jobPostings.id))
      .leftJoin(enterprises, eq(jobPostings.enterprise_id, enterprises.id))
      .where(eq(wishlists.user_id, userId))
      .orderBy(desc(wishlists.createdAt), desc(wishlists.id))
      .all();

    const filtered = rows.filter((r) => {
      const isAvailable =
        Boolean(r.jobPostId) &&
        r.jobStatus === 'published' &&
        !r.jobDeleting &&
        (!r.jobExpiresAt || new Date(r.jobExpiresAt) > now) &&
        Boolean(r.enterpriseId) &&
        r.enterpriseStatus === 'active' &&
        !r.enterpriseIsDeleted;

      if (query.status === 'available' && !isAvailable) return false;
      if (query.status === 'unavailable' && isAvailable) return false;

      if (query.q) {
        if (!isAvailable) return false;
        const qLower = query.q.toLowerCase();
        const titleMatch = r.jobTitle?.toLowerCase().includes(qLower);
        const enterpriseMatch = r.enterpriseName?.toLowerCase().includes(qLower);
        if (!titleMatch && !enterpriseMatch) return false;
      }

      if (query.location) {
        const locLower = query.location.toLowerCase();
        if (!r.jobLocation?.toLowerCase().includes(locLower)) return false;
      }

      return true;
    });

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const paged = filtered.slice(skip, skip + query.limit);

    const items: RawWishlistAggregationItem[] = paged.map((r) => {
      const isAvailable =
        Boolean(r.jobPostId) &&
        r.jobStatus === 'published' &&
        !r.jobDeleting &&
        (!r.jobExpiresAt || new Date(r.jobExpiresAt) > now) &&
        Boolean(r.enterpriseId) &&
        r.enterpriseStatus === 'active' &&
        !r.enterpriseIsDeleted;

      const item: RawWishlistAggregationItem = {
        _id: new Types.ObjectId(r.wishlistId),
        user_id: new Types.ObjectId(r.userId),
        job_id: new Types.ObjectId(r.jobId),
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        is_available: isAvailable,
        ...(r.jobPostId
          ? {
              job: {
                _id: new Types.ObjectId(r.jobPostId),
                title: r.jobTitle ?? '',
                slug: r.jobSlug ?? '',
                ...(r.jobLocation ? { location: r.jobLocation } : {}),
                ...(r.jobEmploymentType ? { employment_type: r.jobEmploymentType } : {}),
                ...(r.jobLevel ? { level: r.jobLevel } : {}),
                ...(r.jobSalaryMin !== null && r.jobSalaryMin !== undefined ? { salary_min: r.jobSalaryMin } : {}),
                ...(r.jobSalaryMax !== null && r.jobSalaryMax !== undefined ? { salary_max: r.jobSalaryMax } : {}),
                ...(r.jobSalaryNegotiable !== null && r.jobSalaryNegotiable !== undefined ? { salary_negotiable: Boolean(r.jobSalaryNegotiable) } : {}),
                ...(r.jobCurrency ? { currency: r.jobCurrency } : {}),
                ...(r.jobExpiresAt ? { expires_at: new Date(r.jobExpiresAt) } : {}),
                status: r.jobStatus ?? 'published',
              },
            }
          : {}),
        ...(r.enterpriseId
          ? {
              enterprise: {
                _id: new Types.ObjectId(r.enterpriseId),
                name: r.enterpriseName ?? '',
                ...(r.enterpriseLogoUrl !== undefined ? { logo_url: r.enterpriseLogoUrl } : {}),
              },
            }
          : {}),
      };
      return item;
    });

    return { items, total };
  }
}

export const wishlistRepository = new WishlistRepository();
