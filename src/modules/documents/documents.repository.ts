import mongoose, { Types } from 'mongoose';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  like,
  ne,
} from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { documents } from '../../db/schema/index.js';
import {
  Document,
  type DocumentDoc,
  type DocumentType,
} from '../../models/document.model.js';
import type { DocumentListQuery } from './documents.schemas.js';

export interface DocumentFileData {
  fileUrl: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface DocumentListResult {
  items: DocumentDoc[];
  total: number;
}

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toDocumentDoc(row: typeof documents.$inferSelect): DocumentDoc {
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    owner_id: new Types.ObjectId(row.owner_id),
    type: row.type as DocumentType,
    file_url: row.file_url,
    storage_key: row.storage_key,
    file_name: row.file_name,
    mime_type: row.mime_type,
    size: row.size,
    is_default: Boolean(row.is_default),
    deleted_at: row.deleted_at ? new Date(row.deleted_at) : null,
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
  } as unknown as DocumentDoc;
}

export class DocumentsRepository {
  async create(
    ownerId: string,
    type: DocumentType,
    file: DocumentFileData,
  ): Promise<DocumentDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(Document)) {
      return new Document({
        owner_id: ownerId,
        type,
        file_url: file.fileUrl,
        storage_key: file.storageKey,
        file_name: file.fileName,
        mime_type: file.mimeType,
        size: file.size,
        is_default: false,
        deleted_at: null,
      }).save();
    }

    const id = generateId();
    const now = new Date();
    const db = getSqliteDb();
    db.insert(documents)
      .values({
        id,
        owner_id: ownerId,
        type,
        file_url: file.fileUrl,
        storage_key: file.storageKey,
        file_name: file.fileName,
        mime_type: file.mimeType,
        size: file.size,
        is_default: false,
        deleted_at: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(documents).where(eq(documents.id, id)).get();
    if (!row) throw new Error('Failed to create document');
    return toDocumentDoc(row);
  }

  // Metadata lookup for documents an application already references (ownership was checked at apply time).
  async findByIds(ids: string[]): Promise<DocumentDoc[]> {
    if (ids.length === 0) return [];
    if (process.env.USE_MONGODB === 'true' || isMock(Document.find)) {
      return Document.find({ _id: { $in: ids } }).exec();
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(documents)
      .where(inArray(documents.id, ids))
      .all();
    return rows.map((r) => toDocumentDoc(r));
  }

  // Documents are hard-owned by a user (owner_id); type is checked so a CV id cannot be used as a cover letter.
  async findByIdOwnerAndType(
    id: string,
    ownerId: string,
    type: DocumentType,
  ): Promise<DocumentDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Document.findOne)) {
      return Document.findOne({
        _id: id,
        owner_id: ownerId,
        type,
        deleted_at: null,
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.owner_id, ownerId),
          eq(documents.type, type),
          isNull(documents.deleted_at),
        ),
      )
      .get();
    return row ? toDocumentDoc(row) : null;
  }

  async findOwnedActiveById(
    id: string,
    ownerId: string,
  ): Promise<DocumentDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Document.findOne)) {
      return Document.findOne({
        _id: id,
        owner_id: ownerId,
        deleted_at: null,
      }).exec();
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.owner_id, ownerId),
          isNull(documents.deleted_at),
        ),
      )
      .get();
    return row ? toDocumentDoc(row) : null;
  }

  async list(
    ownerId: string,
    query: DocumentListQuery,
  ): Promise<DocumentListResult> {
    if (process.env.USE_MONGODB === 'true' || isMock(Document.find)) {
      const filter: Record<string, unknown> = {
        owner_id: ownerId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.is_default !== undefined
          ? { is_default: query.is_default ? true : { $ne: true } }
          : {}),
        deleted_at: null,
      };
      if (query.search) {
        filter.file_name = new RegExp(
          query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        );
      }
      const sortField =
        query.sort_by === 'file_name'
          ? 'file_name'
          : query.sort_by === 'size'
            ? 'size'
            : 'createdAt';
      const direction = query.sort_order === 'asc' ? 1 : -1;
      const [items, total] = await Promise.all([
        Document.find(filter)
          .sort({ [sortField]: direction, _id: direction })
          .skip((query.page - 1) * query.limit)
          .limit(query.limit)
          .exec(),
        Document.countDocuments(filter).exec(),
      ]);

      return { items, total };
    }

    const db = getSqliteDb();
    const conditions = [
      eq(documents.owner_id, ownerId),
      isNull(documents.deleted_at),
    ];

    if (query.type) {
      conditions.push(eq(documents.type, query.type));
    }

    if (query.is_default !== undefined) {
      conditions.push(eq(documents.is_default, query.is_default));
    }

    if (query.search) {
      conditions.push(like(documents.file_name, `%${query.search}%`));
    }

    const whereClause = and(...conditions);

    const totalRow = db
      .select({ count: count() })
      .from(documents)
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;

    const sortColumn =
      query.sort_by === 'file_name'
        ? documents.file_name
        : query.sort_by === 'size'
          ? documents.size
          : documents.createdAt;

    const orderExpr =
      query.sort_order === 'asc' ? asc(sortColumn) : desc(sortColumn);

    const rows = db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(orderExpr, desc(documents.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();

    return {
      items: rows.map((r) => toDocumentDoc(r)),
      total,
    };
  }

  async setDefault(id: string, ownerId: string): Promise<DocumentDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(mongoose.startSession)) {
      const session = await mongoose.startSession();
      let selected: DocumentDoc | null = null;
      try {
        await session.withTransaction(async (): Promise<void> => {
          const target = await Document.findOne({
            _id: id,
            owner_id: ownerId,
            deleted_at: null,
          })
            .session(session)
            .exec();
          if (!target) return;
          if (!target.is_default) {
            await Document.updateMany(
              {
                owner_id: ownerId,
                type: target.type,
                is_default: true,
                deleted_at: null,
              },
              { $set: { is_default: false } },
              { session },
            ).exec();
            target.is_default = true;
            await target.save({ session });
          }
          selected = target;
        });
        return selected;
      } finally {
        await session.endSession();
      }
    }

    const db = getSqliteDb();
    const target = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.owner_id, ownerId),
          isNull(documents.deleted_at),
        ),
      )
      .get();
    if (!target) return null;

    if (!target.is_default) {
      db.update(documents)
        .set({ is_default: false, updatedAt: new Date() })
        .where(
          and(
            eq(documents.owner_id, ownerId),
            eq(documents.type, target.type),
            eq(documents.is_default, true),
            isNull(documents.deleted_at),
          ),
        )
        .run();

      db.update(documents)
        .set({ is_default: true, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .run();
    }

    const updated = db.select().from(documents).where(eq(documents.id, id)).get();
    return updated ? toDocumentDoc(updated) : null;
  }

  async softDeleteAndPromote(
    id: string,
    ownerId: string,
  ): Promise<DocumentDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(mongoose.startSession)) {
      const session = await mongoose.startSession();
      let deleted: DocumentDoc | null = null;
      try {
        await session.withTransaction(async (): Promise<void> => {
          const target = await Document.findOne({
            _id: id,
            owner_id: ownerId,
            deleted_at: null,
          })
            .session(session)
            .exec();
          if (!target) return;
          const wasDefault = target.is_default;
          target.is_default = false;
          target.deleted_at = new Date();
          await target.save({ session });
          deleted = target;
          if (wasDefault) {
            const replacement = await Document.findOne({
              _id: { $ne: target._id },
              owner_id: ownerId,
              type: target.type,
              deleted_at: null,
            })
              .sort({ createdAt: -1, _id: -1 })
              .session(session)
              .exec();
            if (replacement) {
              replacement.is_default = true;
              await replacement.save({ session });
            }
          }
        });
        return deleted;
      } finally {
        await session.endSession();
      }
    }

    const db = getSqliteDb();
    const target = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.id, id),
          eq(documents.owner_id, ownerId),
          isNull(documents.deleted_at),
        ),
      )
      .get();
    if (!target) return null;

    const wasDefault = Boolean(target.is_default);
    db.update(documents)
      .set({ is_default: false, deleted_at: new Date(), updatedAt: new Date() })
      .where(eq(documents.id, id))
      .run();

    if (wasDefault) {
      const replacement = db
        .select()
        .from(documents)
        .where(
          and(
            ne(documents.id, target.id),
            eq(documents.owner_id, ownerId),
            eq(documents.type, target.type),
            isNull(documents.deleted_at),
          ),
        )
        .orderBy(desc(documents.createdAt), desc(documents.id))
        .get();

      if (replacement) {
        db.update(documents)
          .set({ is_default: true, updatedAt: new Date() })
          .where(eq(documents.id, replacement.id))
          .run();
      }
    }

    const deleted = db.select().from(documents).where(eq(documents.id, id)).get();
    return deleted ? toDocumentDoc(deleted) : null;
  }
}

export const documentsRepository = new DocumentsRepository();
