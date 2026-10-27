import type { RequestHandler } from 'express';
import multer from 'multer';

import {
  REPORT_CONFIG,
  REPORT_MESSAGES,
} from '../modules/reports/reports.constants.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';

export const MAX_EVIDENCE_FILE_SIZE =
  REPORT_CONFIG.MAX_FILE_SIZE_MB * REPORT_CONFIG.BYTES_PER_MB;

const allowedExtensions = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

type AllowedExtension = keyof typeof allowedExtensions;

const multiUploader = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_EVIDENCE_FILE_SIZE,
    files: REPORT_CONFIG.MAX_EVIDENCE_FILES,
  },
}).array('files', REPORT_CONFIG.MAX_EVIDENCE_FILES);

export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export function isAllowedReportFile(fileName: string, mimeType: string): boolean {
  const ext = getFileExtension(fileName) as AllowedExtension;
  if (!ext || !(ext in allowedExtensions)) {
    return false;
  }
  return allowedExtensions[ext] === mimeType;
}

export const parseReportEvidenceUpload: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => {
      multiUploader(req, res, (error?: unknown) => {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            reject(
              createHttpError(
                HTTP_STATUS.HTTP_400_BAD_REQUEST,
                REPORT_MESSAGES.FILE_SIZE_LIMIT,
              ),
            );
            return;
          }
          if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
            reject(
              createHttpError(
                HTTP_STATUS.HTTP_400_BAD_REQUEST,
                REPORT_MESSAGES.FILE_COUNT_LIMIT,
              ),
            );
            return;
          }
        }
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) {
      if (files.length > REPORT_CONFIG.MAX_EVIDENCE_FILES) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          REPORT_MESSAGES.FILE_COUNT_LIMIT,
        );
      }

      for (const file of files) {
        if (!isAllowedReportFile(file.originalname, file.mimetype)) {
          throw createHttpError(
            HTTP_STATUS.HTTP_400_BAD_REQUEST,
            `${file.originalname} can’t be added. ${REPORT_MESSAGES.FILE_NOT_ACCEPTED}`,
          );
        }

        if (file.size <= 0) {
          throw createHttpError(
            HTTP_STATUS.HTTP_400_BAD_REQUEST,
            `${file.originalname} is empty`,
          );
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
