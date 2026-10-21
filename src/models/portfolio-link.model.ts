import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export interface PortfolioLinkData {
  owner_id: Types.ObjectId;
  title: string;
  url: string;
  description?: string;
  version: number;
  idempotency_key: string;
  request_hash: string;
}

const portfolioLinkSchema = new Schema<PortfolioLinkData>(
  {
    owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    description: { type: String, trim: true },
    version: { type: Number, required: true, default: 1 },
    idempotency_key: { type: String, required: true, select: false },
    request_hash: { type: String, required: true, select: false },
  },
  { timestamps: true, collection: 'portfolio_links' },
);

portfolioLinkSchema.index({ owner_id: 1, url: 1 }, { unique: true });
portfolioLinkSchema.index({ owner_id: 1, idempotency_key: 1 }, { unique: true });
portfolioLinkSchema.index({ owner_id: 1, createdAt: -1, _id: -1 });

export const PortfolioLink = model<PortfolioLinkData>('PortfolioLink', portfolioLinkSchema);
export type PortfolioLinkDoc = ReturnType<typeof PortfolioLink.prototype.toObject> & { _id: Types.ObjectId };
