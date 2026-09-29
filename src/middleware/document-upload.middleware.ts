import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';
import multer from 'multer';

import { getCloudinary } from '../config/cloudinary.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';

const BYTES_PER_MEGABYTE = 1_048_576;
const MAX_DOCUMENT_FILE_SIZE_MB = 5;
const PDF_SIGNATURE_LENGTH = 5;
const DOC_SIGNATURE_LENGTH = 8;
const OFFICE_SIGNATURE_LENGTH = 4;
const PDF_SIGNATURE = '%PDF-';
const DOC_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const OFFICE_SIGNATURE = Buffer.from('504b0304', 'hex');
export const MAX_DOCUMENT_FILE_SIZE = MAX_DOCUMENT_FILE_SIZE_MB * BYTES_PER_MEGABYTE;

const mimeTypes = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

type Extension = keyof typeof mimeTypes;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_FILE_SIZE, files: 1 },
}).single('file');

function extension(fileName: string): Extension | undefined {
  const value = fileName.split('.').pop()?.toLowerCase();
  return value && value in mimeTypes ? (value as Extension) : undefined;
}

function validSignature(ext: Extension, buffer: Buffer): boolean {
  if (ext === 'pdf') {
    return buffer.subarray(0, PDF_SIGNATURE_LENGTH).toString('ascii') === PDF_SIGNATURE;
  }

  if (ext === 'doc') {
    return buffer.subarray(0, DOC_SIGNATURE_LENGTH).equals(DOC_SIGNATURE);
  }

  return buffer.subarray(0, OFFICE_SIGNATURE_LENGTH).equals(OFFICE_SIGNATURE);
}

export interface UploadedDocument {
  fileUrl: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
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

    const ext = extension(file.originalname);
    if (!ext || file.mimetype !== mimeTypes[ext] || !validSignature(ext, file.buffer)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Only valid PDF, DOC, and DOCX files are accepted');
    }

    if (file.size <= 0) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file is empty');
    }

    const publicId = `document-${randomUUID()}.${ext}`;
    const cloudinary = getCloudinary();
    const result = await new Promise<{ secure_url?: string; public_id?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'italent/documents', public_id: publicId, resource_type: 'raw' },
        (error, output) => {
          if (error || !output) {
            reject(error ?? new Error('Document upload failed'));
            return;
          }
          resolve(output);
        },
      );
      stream.end(file.buffer);
    }).catch(() => {
      throw createHttpError(HTTP_STATUS.HTTP_502_BAD_GATEWAY, 'Document upload failed');
    });

    if (!result.secure_url || !result.public_id) {
      throw createHttpError(HTTP_STATUS.HTTP_502_BAD_GATEWAY, 'Document upload failed');
    }

    res.locals.uploadedDocument = {
      fileUrl: result.secure_url,
      storageKey: result.public_id,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    } satisfies UploadedDocument;
    next();
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Document file cannot exceed 5MB'));
      return;
    }
    next(error);
  }
};
