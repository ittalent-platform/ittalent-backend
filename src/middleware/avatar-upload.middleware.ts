import type { RequestHandler } from 'express';
import multer from 'multer';

import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';

const BYTES_PER_MEGABYTE = 1_048_576;
const MAX_AVATAR_MEGABYTES = 5;
const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex');
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const RIFF_SIGNATURE = 'RIFF';
const WEBP_SIGNATURE = 'WEBP';
const RIFF_END = RIFF_SIGNATURE.length;
const WEBP_OFFSET = 8;
const WEBP_END = WEBP_OFFSET + WEBP_SIGNATURE.length;
export const AVATAR_MAX_BYTES = MAX_AVATAR_MEGABYTES * BYTES_PER_MEGABYTE;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_MAX_BYTES, files: 1 } }).single('avatar');

const JPEG_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg']);
const AVATAR_UPLOAD_MESSAGES = {
  REQUIRED: 'Avatar file is required',
  INVALID_FORMAT: 'Only valid JPEG, PNG, and WebP images are accepted',
  FILE_TOO_LARGE: 'Avatar file cannot exceed 5MB',
  INVALID_UPLOAD: 'Invalid avatar upload',
} as const;

export function isValidAvatar(buffer: Buffer, mimeType: string): boolean {
  // Strip optional media-type parameters (e.g. "; charset=binary") and normalize casing before matching.
  const normalizedMime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (JPEG_MIME_TYPES.has(normalizedMime)) {
    return buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);
  }
  if (normalizedMime === 'image/png') {
    return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  }
  if (normalizedMime === 'image/webp') {
    // WebP files use a 12-byte RIFF container header: "RIFF" at bytes 0..3, 4-byte file size, and "WEBP" at bytes 8..11.
    return (
      buffer.length >= WEBP_END &&
      buffer.toString('ascii', 0, RIFF_END) === RIFF_SIGNATURE &&
      buffer.toString('ascii', WEBP_OFFSET, WEBP_END) === WEBP_SIGNATURE
    );
  }
  return false;
}

export const uploadAvatar: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (!req.file) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.REQUIRED);
    }
    if (!isValidAvatar(req.file.buffer, req.file.mimetype)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.INVALID_FORMAT);
    }
    next();
  } catch (error) {
    if (error instanceof multer.MulterError) {
      next(
        createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          error.code === 'LIMIT_FILE_SIZE' ? AVATAR_UPLOAD_MESSAGES.FILE_TOO_LARGE : AVATAR_UPLOAD_MESSAGES.INVALID_UPLOAD,
        ),
      );
      return;
    }
    next(error);
  }
};
