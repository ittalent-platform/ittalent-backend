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

export function isValidAvatar(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') return buffer.length >= JPEG_SIGNATURE.length && buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE);
  if (mimeType === 'image/png') return buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  if (mimeType === 'image/webp') return buffer.length >= WEBP_END && buffer.toString('ascii', 0, RIFF_END) === RIFF_SIGNATURE && buffer.toString('ascii', WEBP_OFFSET, WEBP_END) === WEBP_SIGNATURE;
  return false;
}

export const uploadAvatar: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (!req.file || !isValidAvatar(req.file.buffer, req.file.mimetype)) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Only valid JPEG, PNG, and WebP images are accepted');
    }
    next();
  } catch (error) {
    if (error instanceof multer.MulterError) {
      next(createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, error.code === 'LIMIT_FILE_SIZE' ? 'Avatar file cannot exceed 5MB' : 'Invalid avatar upload'));
      return;
    }
    next(error);
  }
};
