import mongoose from 'mongoose';
import { Application } from '../../models/application.model.js';
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

export class DocumentsRepository {
  async create(
    ownerId: string,
    type: DocumentType,
    file: DocumentFileData,
  ): Promise<DocumentDoc> {
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

  // Metadata lookup for documents an application already references (ownership was checked at apply time).
  async findByIds(ids: string[]): Promise<DocumentDoc[]> {
    return Document.find({ _id: { $in: ids } }).exec();
  }

  // Documents are hard-owned by a user (owner_id); type is checked so a CV id cannot be used as a cover letter.
  async findByIdOwnerAndType(
    id: string,
    ownerId: string,
    type: DocumentType,
  ): Promise<DocumentDoc | null> {
    return Document.findOne({
      _id: id,
      owner_id: ownerId,
      type,
      deleted_at: null,
    }).exec();
  }

  async findOwnedActiveById(
    id: string,
    ownerId: string,
  ): Promise<DocumentDoc | null> {
    return Document.findOne({
      _id: id,
      owner_id: ownerId,
      deleted_at: null,
    }).exec();
  }

  async findActiveById(id: string): Promise<DocumentDoc | null> {
    return Document.findOne({ _id: id, deleted_at: null }).exec();
  }

  async isReferenced(id: string): Promise<boolean> {
    return (
      (await Application.exists({
        $or: [{ cv_id: id }, { cover_letter_id: id }],
      }).exec()) !== null
    );
  }

  async list(
    ownerId: string | undefined,
    query: DocumentListQuery,
  ): Promise<DocumentListResult> {
    const filter: Record<string, unknown> = {
      ...(ownerId ? { owner_id: ownerId } : {}),
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

  async setDefault(id: string, ownerId: string): Promise<DocumentDoc | null> {
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

  async softDeleteAndPromote(
    id: string,
    ownerId: string,
  ): Promise<DocumentDoc | null> {
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
}

export const documentsRepository = new DocumentsRepository();
