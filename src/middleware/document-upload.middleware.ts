import type { RequestHandler } from 'express';
import multer from 'multer';

import { documentTypes } from '../models/document.model.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';
import {
  isValidDocumentBuffer,
  storageService,
  type StorageUploadResult,
  type SupportedDocumentExtension,
} from '../shared/services/storage.service.js';

const BYTES_PER_MEGABYTE = 1_048_576;
const MAX_DOCUMENT_FILE_SIZE_MB = 5;
const MAX_DOCUMENT_FILE_NAME_LENGTH = 255;
export const MAX_DOCUMENT_FILE_SIZE = MAX_DOCUMENT_FILE_SIZE_MB * BYTES_PER_MEGABYTE;

const mimeTypes = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

export type UploadedDocument = StorageUploadResult;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 1 },
}).single('file');

function extension(fileName: string): SupportedDocumentExtension | undefined {
  const value = fileName.split('.').pop()?.toLowerCase();
  return value && value in mimeTypes ? (value as SupportedDocumentExtension) : undefined;
}

export const uploadDocument: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => {
      uploader(req, res, (error?: unknown) => (error ? reject(error) : resolve()));
    });

    const file = req.file;
    if (!file) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file is required');
    }

    if (!documentTypes.some((type) => type === req.body?.type)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document type must be cv or cover_letter');
    }

    if (!file.originalname.trim() || file.originalname.length > MAX_DOCUMENT_FILE_NAME_LENGTH) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file name must be between 1 and 255 characters');
    }

    const ext = extension(file.originalname);
    if (!ext || file.mimetype !== mimeTypes[ext] || !isValidDocumentBuffer(ext, file.buffer)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Only valid PDF, DOC, and DOCX files are accepted');
    }

    if (file.size <= 0) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file is empty');
    }

    const uploaded = await storageService.uploadFile({
      buffer: file.buffer,
      fileName: file.originalname,
      folder: 'italent/documents',
      prefix: 'document',
      resourceType: 'raw',
      mimeType: file.mimetype,
    });

    res.locals.uploadedDocument = uploaded satisfies UploadedDocument;
    next();
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file cannot exceed 5MB'));
      return;
    }
    next(error);
  }
};
