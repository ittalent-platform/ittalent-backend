import type { Types } from 'mongoose';

import type { DocumentDoc, DocumentType } from '../../models/document.model.js';
import { documentsRepository, type DocumentsRepository } from './documents.repository.js';

// Read-only for now: other modules use this to check a CV/cover letter belongs to an applicant and is still available.
export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository = documentsRepository) {}

  async findActiveByIdForApplicant(
    id: string,
    applicantId: Types.ObjectId | string,
    type: DocumentType,
  ): Promise<DocumentDoc | null> {
    return this.repository.findActiveByIdForApplicant(id, applicantId, type);
  }
}

export const documentsService = new DocumentsService();