import { Types, type ClientSession, type PipelineStage } from 'mongoose';

import { Wishlist, type WishlistDoc } from '../../models/wishlist.model.js';
import type { WishlistQuery } from './wishlist.schemas.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    const doc = new Wishlist({
      user_id: new Types.ObjectId(userId),
      job_id: new Types.ObjectId(jobId),
    });
    return doc.save(session ? { session } : undefined);
  }

  async findByUserAndJob(userId: string, jobId: string): Promise<WishlistDoc | null> {
    return Wishlist.findOne({
      user_id: new Types.ObjectId(userId),
      job_id: new Types.ObjectId(jobId),
    }).exec();
  }

  async deleteByUserAndJob(userId: string, jobId: string, session?: ClientSession): Promise<boolean> {
    const result = await Wishlist.deleteOne(
      {
        user_id: new Types.ObjectId(userId),
        job_id: new Types.ObjectId(jobId),
      },
      session ? { session } : undefined,
    ).exec();
    return result.deletedCount > 0;
  }

  async deleteByIdAndUser(userId: string, id: string, session?: ClientSession): Promise<boolean> {
    const result = await Wishlist.deleteOne(
      {
        _id: new Types.ObjectId(id),
        user_id: new Types.ObjectId(userId),
      },
      session ? { session } : undefined,
    ).exec();
    return result.deletedCount > 0;
  }

  async deleteUnavailableByUser(userId: string, session?: ClientSession): Promise<number> {
    const now = new Date();
    const pipeline: PipelineStage[] = [
      {
        $match: {
          user_id: new Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: 'job_postings',
          localField: 'job_id',
          foreignField: '_id',
          as: 'job',
        },
      },
      {
        $unwind: {
          path: '$job',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'enterprises',
          localField: 'job.enterprise_id',
          foreignField: '_id',
          as: 'enterprise',
        },
      },
      {
        $unwind: {
          path: '$enterprise',
          preserveNullAndEmptyArrays: true,
        },
      },
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
      {
        $match: {
          is_available: false,
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ];

    const unavailableDocs = await Wishlist.aggregate<{ _id: Types.ObjectId }>(pipeline).exec();
    if (unavailableDocs.length === 0) {
      return 0;
    }

    const ids = unavailableDocs.map((doc) => doc._id);
    const result = await Wishlist.deleteMany(
      {
        _id: { $in: ids },
        user_id: new Types.ObjectId(userId),
      },
      session ? { session } : undefined,
    ).exec();

    return result.deletedCount;
  }

  async countByUser(userId: string): Promise<number> {
    return Wishlist.countDocuments({
      user_id: new Types.ObjectId(userId),
    }).exec();
  }

  async findPaginatedWishlist(
    userId: string,
    query: WishlistQuery,
  ): Promise<{ items: RawWishlistAggregationItem[]; total: number }> {
    const now = new Date();
    const pipeline: PipelineStage[] = [
      {
        $match: {
          user_id: new Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: 'job_postings',
          localField: 'job_id',
          foreignField: '_id',
          as: 'job',
        },
      },
      {
        $unwind: {
          path: '$job',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'enterprises',
          localField: 'job.enterprise_id',
          foreignField: '_id',
          as: 'enterprise',
        },
      },
      {
        $unwind: {
          path: '$enterprise',
          preserveNullAndEmptyArrays: true,
        },
      },
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
      const pattern = new RegExp(escapeRegex(query.q), 'i');
      pipeline.push({
        $match: {
          is_available: true,
          $or: [
            { 'job.title': { $regex: pattern } },
            { 'enterprise.name': { $regex: pattern } },
          ],
        },
      });
    }

    if (query.location) {
      const pattern = new RegExp(escapeRegex(query.location), 'i');
      pipeline.push({
        $match: {
          'job.location': { $regex: pattern },
        },
      });
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
    }>(pipeline).exec();

    const total = result[0]?.metadata[0]?.total ?? 0;
    const items = result[0]?.data ?? [];

    return { items, total };
  }
}

export const wishlistRepository = new WishlistRepository();
