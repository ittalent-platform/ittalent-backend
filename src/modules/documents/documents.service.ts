import type { DocumentDoc, DocumentType } from '../../models/document.model.js';
import type { UploadedDocument } from '../../middleware/document-upload.middleware.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  documentsRepository,
  type DocumentsRepository,
} from './documents.repository.js';
import type {
  DocumentListQuery,
  DocumentResponse,
} from './documents.schemas.js';
import {
  DOCUMENT_MESSAGES,
  GOOGLE_DOCS_VIEWER_URL,
} from './documents.constants.js';

export interface PaginatedDocuments {
  items: DocumentResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface DocumentFileResult {
  fileName: string;
  mimeType: string;
  response: Response;
}
export type DocumentPreviewResult =
  | { kind: 'file'; file: DocumentFileResult }
  | { kind: 'url'; previewUrl: string };

export class DocumentsService {
  constructor(
    private readonly repository: DocumentsRepository = documentsRepository,
  ) {}

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
      isDefault: item.is_default ?? false,
      createdAt: new Date(raw.createdAt).toISOString(),
    };
  }

  async upload(
    ownerId: string,
    type: DocumentType,
    file: UploadedDocument,
  ): Promise<DocumentResponse> {
    return this.map(await this.repository.create(ownerId, type, file));
  }

  // Returns the raw document only if it belongs to `ownerId` and has the expected type.
  async findOwnedByType(
    id: string,
    ownerId: string,
    type: DocumentType,
  ): Promise<DocumentDoc | null> {
    return this.repository.findByIdOwnerAndType(id, ownerId, type);
  }

  // Returns the raw documents an application references, for its submitted-attachment metadata.
  async findByIds(ids: string[]): Promise<DocumentDoc[]> {
    return ids.length ? this.repository.findByIds(ids) : [];
  }

  async list(
    ownerId: string,
    query: DocumentListQuery,
  ): Promise<PaginatedDocuments> {
    const result = await this.repository.list(ownerId, query);
    return {
      items: result.items.map((item) => this.map(item)),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }

  private async getOwnedActive(
    id: string,
    ownerId: string,
  ): Promise<DocumentDoc> {
    const document = await this.repository.findOwnedActiveById(id, ownerId);
    if (!document)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        DOCUMENT_MESSAGES.NOT_FOUND,
      );
    return document;
  }

  private async fetchFile(document: DocumentDoc): Promise<DocumentFileResult> {
    const response = await fetch(document.file_url).catch(() => undefined);
    if (!response?.ok || !response.body) {
      throw createHttpError(
        HTTP_STATUS.HTTP_502_BAD_GATEWAY,
        DOCUMENT_MESSAGES.DOWNLOAD_FAILED,
      );
    }
    return {
      fileName: document.file_name,
      mimeType: document.mime_type,
      response,
    };
  }

  async download(ownerId: string, id: string): Promise<DocumentFileResult> {
    return this.fetchFile(await this.getOwnedActive(id, ownerId));
  }

  async preview(ownerId: string, id: string): Promise<DocumentPreviewResult> {
    const document = await this.getOwnedActive(id, ownerId);
    if (document.mime_type === 'application/pdf') {
      return { kind: 'file', file: await this.fetchFile(document) };
    }
    if (
      document.mime_type !== 'application/msword' &&
      document.mime_type !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        DOCUMENT_MESSAGES.PREVIEW_UNSUPPORTED,
      );
    }
    const preview = new URL(GOOGLE_DOCS_VIEWER_URL);
    preview.searchParams.set('embedded', 'true');
    preview.searchParams.set('url', document.file_url);
    return { kind: 'url', previewUrl: preview.toString() };
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const document = await this.getOwnedActive(id, ownerId);
    if (await this.repository.isReferenced(id)) {
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        DOCUMENT_MESSAGES.IN_USE,
      );
    }
    if (
      !(await this.repository.softDeleteAndPromote(
        String(document._id),
        ownerId,
      ))
    ) {
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        DOCUMENT_MESSAGES.NOT_FOUND,
      );
    }
  }

  async setDefault(ownerId: string, id: string): Promise<DocumentResponse> {
    const selected = await this.repository.setDefault(id, ownerId);
    if (!selected)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        DOCUMENT_MESSAGES.NOT_FOUND,
      );
    return this.map(selected);
  }
}

export const documentsService = new DocumentsService();
