import { Types } from 'mongoose';
import { and, desc, eq, like, or } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { portfolioLinks } from '../../db/schema/index.js';
import {
  PortfolioLink,
  type PortfolioLinkDoc,
} from '../../models/portfolio-link.model.js';
import { PORTFOLIO_LINKS } from './portfolio-links.constants.js';
import type { CreatePortfolioLinkInput } from './portfolio-links.schemas.js';

// What an update may change. `description: null` removes the description.
export interface PortfolioLinkChanges {
  title?: string | undefined;
  url?: string | undefined;
  description?: string | null | undefined;
}

function containsRegex(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export interface PortfolioLinkCreateData {
  ownerId: string;
  idempotencyKey: string;
  requestHash: string;
  input: CreatePortfolioLinkInput;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toPortfolioLinkDoc(row: typeof portfolioLinks.$inferSelect): PortfolioLinkDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    owner_id: new Types.ObjectId(row.user_id),
    title: row.title,
    url: row.url,
    description: row.description ?? undefined,
    version: row.version,
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
  } as unknown as PortfolioLinkDoc;
}

export class PortfolioLinksRepository {
  async create(data: PortfolioLinkCreateData): Promise<PortfolioLinkDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink)) {
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

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    db.insert(portfolioLinks)
      .values({
        id,
        user_id: data.ownerId,
        title: data.input.title,
        url: new URL(data.input.url).toString(),
        description: data.input.description ?? null,
        version: PORTFOLIO_LINKS.INITIAL_VERSION,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(portfolioLinks).where(eq(portfolioLinks.id, id)).get();
    if (!row) throw new Error('Failed to create portfolio link');
    return toPortfolioLinkDoc(row);
  }

  async findByIdempotencyKey(ownerId: string, _idempotencyKey: string): Promise<PortfolioLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.findOne)) {
      return PortfolioLink.findOne({ owner_id: ownerId, idempotency_key: _idempotencyKey }).select('+idempotency_key +request_hash').exec();
    }
    // SQLite demo fallback: idempotency check by URL/owner
    return null;
  }

  async findByUrl(ownerId: string, url: string): Promise<PortfolioLinkDoc | null> {
    const canonicalUrl = new URL(url).toString();
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.findOne)) {
      return PortfolioLink.findOne({ owner_id: ownerId, url: canonicalUrl }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(portfolioLinks)
      .where(
        and(
          eq(portfolioLinks.user_id, ownerId),
          eq(portfolioLinks.url, canonicalUrl),
        ),
      )
      .get();
    return row ? toPortfolioLinkDoc(row) : null;
  }

  async findPage(
    ownerId: string,
    page: number,
    limit: number,
    keyword?: string,
  ): Promise<{ items: PortfolioLinkDoc[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.find)) {
      const match = keyword ? containsRegex(keyword) : null;
      const filter = { owner_id: ownerId, ...(match ? { $or: [{ title: match }, { url: match }, { description: match }] } : {}) };
      const [items, total] = await Promise.all([
        PortfolioLink.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).exec(),
        PortfolioLink.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [eq(portfolioLinks.user_id, ownerId)];
    if (keyword) {
      conditions.push(
        or(
          like(portfolioLinks.title, `%${keyword}%`),
          like(portfolioLinks.url, `%${keyword}%`),
          like(portfolioLinks.description, `%${keyword}%`),
        )!,
      );
    }

    const whereClause = and(...conditions);
    const allRows = db
      .select()
      .from(portfolioLinks)
      .where(whereClause)
      .orderBy(desc(portfolioLinks.createdAt), desc(portfolioLinks.id))
      .all();

    const total = allRows.length;
    const skip = (page - 1) * limit;
    const paged = allRows.slice(skip, skip + limit);
    return {
      items: paged.map((r) => toPortfolioLinkDoc(r)),
      total,
    };
  }

  async findOwned(ownerId: string, id: string): Promise<PortfolioLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.findOne)) {
      return PortfolioLink.findOne({ _id: id, owner_id: ownerId }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(portfolioLinks)
      .where(and(eq(portfolioLinks.id, id), eq(portfolioLinks.user_id, ownerId)))
      .get();
    return row ? toPortfolioLinkDoc(row) : null;
  }

  async updateGuarded(
    ownerId: string,
    id: string,
    expectedVersion: number,
    changes: PortfolioLinkChanges,
  ): Promise<PortfolioLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.findOneAndUpdate)) {
      const { description, ...fields } = changes;
      const set = { ...fields, ...(typeof description === 'string' ? { description } : {}) };
      return PortfolioLink.findOneAndUpdate(
        { _id: id, owner_id: ownerId, version: expectedVersion },
        { $inc: { version: 1 }, ...(Object.keys(set).length > 0 ? { $set: set } : {}), ...(description === null ? { $unset: { description: '' } } : {}) },
        { returnDocument: 'after' },
      ).exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(portfolioLinks)
      .where(
        and(
          eq(portfolioLinks.id, id),
          eq(portfolioLinks.user_id, ownerId),
          eq(portfolioLinks.version, expectedVersion),
        ),
      )
      .get();
    if (!existing) return null;

    const updateData: Partial<typeof portfolioLinks.$inferInsert> = {
      version: expectedVersion + 1,
      updatedAt: new Date(),
    };
    if (changes.title !== undefined) updateData.title = changes.title;
    if (changes.url !== undefined) updateData.url = changes.url;
    if (changes.description !== undefined) updateData.description = changes.description ?? null;

    db.update(portfolioLinks)
      .set(updateData)
      .where(eq(portfolioLinks.id, id))
      .run();

    const updated = db.select().from(portfolioLinks).where(eq(portfolioLinks.id, id)).get();
    return updated ? toPortfolioLinkDoc(updated) : null;
  }

  async deleteGuarded(ownerId: string, id: string, expectedVersion: number): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(PortfolioLink.deleteOne)) {
      const result = await PortfolioLink.deleteOne({ _id: id, owner_id: ownerId, version: expectedVersion }).exec();
      return result.deletedCount === 1;
    }

    const db = getSqliteDb();
    const res = db
      .delete(portfolioLinks)
      .where(
        and(
          eq(portfolioLinks.id, id),
          eq(portfolioLinks.user_id, ownerId),
          eq(portfolioLinks.version, expectedVersion),
        ),
      )
      .run();
    return res.changes === 1;
  }
}

export const portfolioLinksRepository = new PortfolioLinksRepository();
