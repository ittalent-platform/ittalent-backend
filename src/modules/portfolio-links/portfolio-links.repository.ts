import { PortfolioLink, type PortfolioLinkDoc } from '../../models/portfolio-link.model.js';
import { PORTFOLIO_LINKS } from './portfolio-links.constants.js';
import type { CreatePortfolioLinkInput } from './portfolio-links.schemas.js';

export interface PortfolioLinkCreateData {
  ownerId: string;
  idempotencyKey: string;
  requestHash: string;
  input: CreatePortfolioLinkInput;
}

export class PortfolioLinksRepository {
  async create(data: PortfolioLinkCreateData): Promise<PortfolioLinkDoc> {
    return new PortfolioLink({
      owner_id: data.ownerId,
      title: data.input.title,
      url: new URL(data.input.url).toString(),
      ...(data.input.description ? { description: data.input.description } : {}),
      version: PORTFOLIO_LINKS.INITIAL_VERSION,
      idempotency_key: data.idempotencyKey,
      request_hash: data.requestHash,
    }).save();
  }

  async findByIdempotencyKey(ownerId: string, idempotencyKey: string): Promise<PortfolioLinkDoc | null> {
    return PortfolioLink.findOne({ owner_id: ownerId, idempotency_key: idempotencyKey }).select('+idempotency_key +request_hash').exec();
  }

  async findByUrl(ownerId: string, url: string): Promise<PortfolioLinkDoc | null> {
    return PortfolioLink.findOne({ owner_id: ownerId, url: new URL(url).toString() }).exec();
  }

  async findPage(ownerId: string, page: number, limit: number): Promise<{ items: PortfolioLinkDoc[]; total: number }> {
    const filter = { owner_id: ownerId };
    const [items, total] = await Promise.all([
      PortfolioLink.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      PortfolioLink.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async findOwned(ownerId: string, id: string): Promise<PortfolioLinkDoc | null> {
    return PortfolioLink.findOne({ _id: id, owner_id: ownerId }).exec();
  }

  /** Deletes only while the stored version still matches; false when it moved on or is gone. */
  async deleteGuarded(ownerId: string, id: string, expectedVersion: number): Promise<boolean> {
    const result = await PortfolioLink.deleteOne({ _id: id, owner_id: ownerId, version: expectedVersion }).exec();
    return result.deletedCount === 1;
  }
}

export const portfolioLinksRepository = new PortfolioLinksRepository();
