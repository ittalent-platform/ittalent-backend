import { Document, type DocumentDoc, type DocumentType } from '../../models/document.model.js';

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
  async create(ownerId: string, type: DocumentType, file: DocumentFileData): Promise<DocumentDoc> {
    return new Document({
      owner_id: ownerId,
      type,
      file_url: file.fileUrl,
      storage_key: file.storageKey,
      file_name: file.fileName,
      mime_type: file.mimeType,
      size: file.size,
    }).save();
  }

  async list(
    ownerId: string | undefined,
    type: DocumentType | undefined,
    page: number,
    limit: number,
    ascending: boolean,
  ): Promise<DocumentListResult> {
    const filter = {
      ...(ownerId ? { owner_id: ownerId } : {}),
      ...(type ? { type } : {}),
    };
    const [items, total] = await Promise.all([
      Document.find(filter)
        .sort({ createdAt: ascending ? 1 : -1, _id: ascending ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      Document.countDocuments(filter).exec(),
    ]);

    return { items, total };
  }
}

export const documentsRepository = new DocumentsRepository();
