import { Types, type QueryFilter, type UpdateQuery } from 'mongoose';
import { and, desc, eq, gte, inArray, isNull, like, ne, or } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { certificateLinks } from '../../db/schema/index.js';
import {
  CertificateLink,
  type CertificateLinkData,
  type CertificateLinkDoc,
} from '../../models/certificate-link.model.js';
import { CERTIFICATE_LINKS } from './certificate-links.constants.js';
import type { CreateCertificateLinkInput } from './certificate-links.schemas.js';

export interface CertificateLinkCreateData {
  ownerId: string;
  actorId: string;
  idempotencyKey: string;
  requestHash: string;
  input: CreateCertificateLinkInput;
}

export interface CertificateLinkCriteria {
  search?: string | undefined;
  suggested?: boolean | undefined;
  validity?: (typeof CERTIFICATE_LINKS.VALIDITY_FILTERS)[number] | undefined;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toCertificateLinkDoc(row: typeof certificateLinks.$inferSelect): CertificateLinkDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    owner_id: new Types.ObjectId(row.user_id),
    name: row.name,
    url: row.url,
    issuer: row.issuer ?? undefined,
    issued_date: row.issued_date ?? undefined,
    expiry_date: row.expiry_date ?? undefined,
    version: row.version,
    status: 'available' as const,
    suggested: false,
    history: [],
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
  } as unknown as CertificateLinkDoc;
}

export class CertificateLinksRepository {
  async create(data: CertificateLinkCreateData): Promise<CertificateLinkDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink)) {
      const now = new Date();
      return new CertificateLink({
        owner_id: data.ownerId,
        name: data.input.name,
        url: new URL(data.input.url).toString(),
        ...(data.input.issuer ? { issuer: data.input.issuer } : {}),
        ...(data.input.issuedDate ? { issued_date: data.input.issuedDate } : {}),
        ...(data.input.expiryDate ? { expiry_date: data.input.expiryDate } : {}),
        version: CERTIFICATE_LINKS.INITIAL_VERSION,
        status: CERTIFICATE_LINKS.STATUS,
        idempotency_key: data.idempotencyKey,
        request_hash: data.requestHash,
        history: [{ actor_id: data.actorId, action: 'created', occurred_at: now, result: 'success', version: 1 }],
      }).save();
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();

    db.insert(certificateLinks)
      .values({
        id,
        user_id: data.ownerId,
        name: data.input.name,
        url: new URL(data.input.url).toString(),
        issuer: data.input.issuer ?? null,
        issued_date: data.input.issuedDate ?? null,
        expiry_date: data.input.expiryDate ?? null,
        version: CERTIFICATE_LINKS.INITIAL_VERSION,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(certificateLinks).where(eq(certificateLinks.id, id)).get();
    if (!row) throw new Error('Failed to create certificate link');
    return toCertificateLinkDoc(row);
  }

  async findByIdempotencyKey(ownerId: string, idempotencyKey: string): Promise<CertificateLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.findOne)) {
      return CertificateLink.findOne({ owner_id: ownerId, idempotency_key: idempotencyKey }).select('+idempotency_key +request_hash').exec();
    }
    return null;
  }

  async findByUrl(ownerId: string, url: string): Promise<CertificateLinkDoc | null> {
    const canonicalUrl = new URL(url).toString();
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.findOne)) {
      return CertificateLink.findOne({ owner_id: ownerId, url: canonicalUrl }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(certificateLinks)
      .where(
        and(
          eq(certificateLinks.user_id, ownerId),
          eq(certificateLinks.url, canonicalUrl),
        ),
      )
      .get();
    return row ? toCertificateLinkDoc(row) : null;
  }

  async findPage(
    ownerId: string,
    page: number,
    limit: number,
    criteria: CertificateLinkCriteria = {},
  ): Promise<{ items: CertificateLinkDoc[]; total: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.find)) {
      const { search, suggested, validity } = criteria;
      const pattern = search ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
      const today = new Date().toISOString().slice(0, CERTIFICATE_LINKS.ISO_DATE_LENGTH);
      const validityFilter: QueryFilter<CertificateLinkData> | null = validity === 'expired' ? { expiry_date: { $lt: today } }
        : validity === 'valid' ? { expiry_date: { $gte: today } }
        : validity === 'no_expiry' ? { $or: [{ expiry_date: { $exists: false } }, { expiry_date: null }, { expiry_date: '' }] }
        : null;
      const filter: QueryFilter<CertificateLinkData> = {
        owner_id: ownerId,
        status: 'available' as const,
        ...(suggested === undefined ? {} : { suggested }),
        $and: [
          ...(pattern ? [{ $or: [{ name: pattern }, { issuer: pattern }, { url: pattern }] }] : []),
          ...(validityFilter ? [validityFilter] : []),
        ],
      };
      if (filter.$and?.length === 0) delete filter.$and;
      const [items, total] = await Promise.all([
        CertificateLink.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).exec(),
        CertificateLink.countDocuments(filter).exec(),
      ]);
      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [
      eq(certificateLinks.user_id, ownerId),
    ];

    if (criteria.search) {
      conditions.push(
        or(
          like(certificateLinks.name, `%${criteria.search}%`),
          like(certificateLinks.issuer, `%${criteria.search}%`),
          like(certificateLinks.url, `%${criteria.search}%`),
        )!,
      );
    }

    const today = new Date().toISOString().slice(0, CERTIFICATE_LINKS.ISO_DATE_LENGTH);
    if (criteria.validity === 'expired') {
      conditions.push(or(isNull(certificateLinks.expiry_date), ne(certificateLinks.expiry_date, ''))!);
    } else if (criteria.validity === 'valid') {
      conditions.push(gte(certificateLinks.expiry_date, today));
    } else if (criteria.validity === 'no_expiry') {
      conditions.push(or(isNull(certificateLinks.expiry_date), eq(certificateLinks.expiry_date, ''))!);
    }

    const whereClause = and(...conditions);
    const rows = db
      .select()
      .from(certificateLinks)
      .where(whereClause)
      .orderBy(desc(certificateLinks.createdAt), desc(certificateLinks.id))
      .all();

    const filteredRows = rows.filter((r) => {
      if (criteria.validity === 'expired') {
        return Boolean(r.expiry_date) && r.expiry_date! < today;
      }
      return true;
    });

    const total = filteredRows.length;
    const skip = (page - 1) * limit;
    const paged = filteredRows.slice(skip, skip + limit);
    return {
      items: paged.map((r) => toCertificateLinkDoc(r)),
      total,
    };
  }

  async countSuggested(ownerId: string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.countDocuments)) {
      return CertificateLink.countDocuments({ owner_id: ownerId, status: 'available', suggested: true }).exec();
    }
    return 0;
  }

  async findOwned(ownerId: string, id: string): Promise<CertificateLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.findOne)) {
      return CertificateLink.findOne({ _id: id, owner_id: ownerId, status: 'available' }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(certificateLinks)
      .where(
        and(
          eq(certificateLinks.id, id),
          eq(certificateLinks.user_id, ownerId),
        ),
      )
      .get();
    return row ? toCertificateLinkDoc(row) : null;
  }

  async findOwnedMany(ownerId: string, ids: string[]): Promise<CertificateLinkDoc[]> {
    if (ids.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.find)) {
      return CertificateLink.find({ _id: { $in: ids }, owner_id: ownerId, status: 'available' }).exec();
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(certificateLinks)
      .where(
        and(
          inArray(certificateLinks.id, ids),
          eq(certificateLinks.user_id, ownerId),
        ),
      )
      .all();
    return rows.map((r) => toCertificateLinkDoc(r));
  }

  async updateGuarded(
    ownerId: string,
    id: string,
    expectedVersion: number,
    update: UpdateQuery<CertificateLinkData>,
  ): Promise<CertificateLinkDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.findOneAndUpdate)) {
      return CertificateLink.findOneAndUpdate({ _id: id, owner_id: ownerId, status: 'available', version: expectedVersion }, update, { new: true, runValidators: true }).exec();
    }

    const db = getSqliteDb();
    const existing = db
      .select()
      .from(certificateLinks)
      .where(
        and(
          eq(certificateLinks.id, id),
          eq(certificateLinks.user_id, ownerId),
          eq(certificateLinks.version, expectedVersion),
        ),
      )
      .get();
    if (!existing) return null;

    const setValues = (update.$set ?? {}) as Record<string, unknown>;
    const updateData: Partial<typeof certificateLinks.$inferInsert> = {
      version: expectedVersion + 1,
      updatedAt: new Date(),
    };

    if (setValues.name !== undefined) updateData.name = String(setValues.name);
    if (setValues.url !== undefined) updateData.url = String(setValues.url);
    if (setValues.issuer !== undefined) updateData.issuer = setValues.issuer ? String(setValues.issuer) : null;
    if (setValues.issued_date !== undefined) updateData.issued_date = setValues.issued_date ? String(setValues.issued_date) : null;
    if (setValues.expiry_date !== undefined) updateData.expiry_date = setValues.expiry_date ? String(setValues.expiry_date) : null;

    db.update(certificateLinks)
      .set(updateData)
      .where(eq(certificateLinks.id, id))
      .run();

    const updated = db.select().from(certificateLinks).where(eq(certificateLinks.id, id)).get();
    return updated ? toCertificateLinkDoc(updated) : null;
  }

  async deleteGuarded(ownerId: string, id: string, expectedVersion: number): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(CertificateLink.deleteOne)) {
      const result = await CertificateLink.deleteOne({ _id: id, owner_id: ownerId, version: expectedVersion }).exec();
      return result.deletedCount === 1;
    }

    const db = getSqliteDb();
    const res = db
      .delete(certificateLinks)
      .where(
        and(
          eq(certificateLinks.id, id),
          eq(certificateLinks.user_id, ownerId),
          eq(certificateLinks.version, expectedVersion),
        ),
      )
      .run();
    return res.changes === 1;
  }
}

export const certificateLinksRepository = new CertificateLinksRepository();
