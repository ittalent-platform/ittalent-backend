import type { DocumentDoc, DocumentType } from '../../models/document.model.js';
import type { UploadedDocument } from '../../middleware/document-upload.middleware.js';
import { documentsRepository, type DocumentsRepository } from './documents.repository.js';
import type { DocumentListQuery, DocumentResponse } from './documents.schemas.js';

export interface PaginatedDocuments {
  items: DocumentResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository = documentsRepository) {}

  private map(item: DocumentDoc): DocumentResponse {
    const raw = item.toObject();
    return {
      id: String(item._id),
      ownerId: String(item.owner_id),
      type: item.type,
      fileUrl: item.file_url,
      fileName: item.file_name,
      mimeType: item.mime_type,
      size: item.size,
      createdAt: new Date(raw.createdAt).toISOString(),
    };
  }

  async upload(ownerId: string, type: DocumentType, file: UploadedDocument): Promise<DocumentResponse> {
    return this.map(await this.repository.create(ownerId, type, file));
  }

  // Returns the raw document only if it belongs to `ownerId` and has the expected type.
  async findOwnedByType(id: string, ownerId: string, type: DocumentType): Promise<DocumentDoc | null> {
    return this.repository.findByIdOwnerAndType(id, ownerId, type);
  }

  // Returns the raw documents an application references, for its submitted-attachment metadata.
  async findByIds(ids: string[]): Promise<DocumentDoc[]> {
    return ids.length ? this.repository.findByIds(ids) : [];
  }

  async list(ownerId: string | undefined, query: DocumentListQuery): Promise<PaginatedDocuments> {
    const result = await this.repository.list(ownerId, query.type, query.page, query.limit, query.sort_order === 'asc');
    return {
      items: result.items.map((item) => this.map(item)),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }
}

export const documentsService = new DocumentsService();
