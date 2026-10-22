import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface WishlistData {
  user_id: Types.ObjectId;
  job_id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const wishlistSchema = new Schema<WishlistData>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    job_id: {
      type: Schema.Types.ObjectId,
      ref: 'JobPosting',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'wishlists',
  },
);

wishlistSchema.index({ user_id: 1, job_id: 1 }, { unique: true });
wishlistSchema.index({ user_id: 1, createdAt: -1 });

export const Wishlist = model<WishlistData>('Wishlist', wishlistSchema);
export type WishlistDoc = ReturnType<typeof Wishlist.prototype.toObject> & {
  _id: Types.ObjectId;
};
