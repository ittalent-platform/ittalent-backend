import { Types, type ClientSession } from 'mongoose';

import { Wishlist, type WishlistDoc } from '../../models/wishlist.model.js';

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

  async countByUser(userId: string): Promise<number> {
    return Wishlist.countDocuments({
      user_id: new Types.ObjectId(userId),
    }).exec();
  }
}

export const wishlistRepository = new WishlistRepository();
