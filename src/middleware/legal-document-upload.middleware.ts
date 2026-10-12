import type { RequestHandler } from 'express';
import multer from 'multer';

import { REGISTRATION_MESSAGES } from '../modules/enterprise-registrations/enterprise-registrations.constants.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';

const BYTES_PER_MEGABYTE = 1_048_576;
const MAX_LEGAL_DOCUMENT_SIZE_MB = 5;
export const MAX_LEGAL_DOCUMENT_FILE_SIZE = MAX_LEGAL_DOCUMENT_SIZE_MB * BYTES_PER_MEGABYTE;

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LEGAL_DOCUMENT_FILE_SIZE, files: 1 },
}).single('file');

export const parseLegalDocumentUpload: RequestHandler = (req, res, next) => {
  uploader(req, res, (error?: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, REGISTRATION_MESSAGES.DOCUMENT_FILE_SIZE_LIMIT));
      return;
    }
    if (error) {
      next(error);
      return;
    }
    next();
  });
};
