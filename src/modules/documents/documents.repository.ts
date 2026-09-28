import type { Types } from 'mongoose';

import { Document, type DocumentDoc, type DocumentType } from '../../models/document.model.js';

export class DocumentsRepository {
  // `deleted_at: null` matches both missing and null, i.e. soft-deleted documents are excluded.
  async findActiveByIdForApplicant(
    id: string,
    applicantId: Types.ObjectId | string,
    type: DocumentType,
  ): Promise<DocumentDoc | null> {
    return Document.findOne({ _id: id, applicant_id: applicantId, type, deleted_at: null })
      .lean<DocumentDoc>()
      .exec();
  }
}

export const documentsRepository = new DocumentsRepository();