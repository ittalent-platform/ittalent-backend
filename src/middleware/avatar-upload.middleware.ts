import path from 'node:path';
import type { RequestHandler } from 'express';
import multer from 'multer';
import sharp from 'sharp';

import { env } from '../config/env.js';
import { HTTP_STATUS } from '../shared/constants/http-status.js';
import { createHttpError } from '../shared/errors/http-error.js';

const JPEG_SIGNATURE = Buffer.from('ffd8ff', 'hex');
const JPEG_END = Buffer.from('ffd9', 'hex');
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const RIFF_SIGNATURE = 'RIFF';
const WEBP_SIGNATURE = 'WEBP';
const WEBP_OFFSET = 8;
const WEBP_HEADER_LENGTH = 12;
const PNG_CHUNK_OVERHEAD = 12;
const PNG_LENGTH_BYTES = 4;
const CONTAINER_TYPE_BYTES = 4;
const RIFF_CONTAINER_OVERHEAD = 8;

export const AVATAR_MAX_BYTES = env.AVATAR_MAX_UPLOAD_BYTES;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
}).single('avatar');

const AVATAR_UPLOAD_MESSAGES = {
  REQUIRED: 'Avatar file is required',
  INVALID_FORMAT: 'Only decodable JPEG, PNG, and WebP images are accepted',
  FILE_TOO_LARGE: 'Avatar exceeds the configured technical upload limit',
  INVALID_DIMENSIONS: 'Avatar dimensions exceed the configured safety limit',
  INVALID_UPLOAD: 'Invalid avatar upload',
} as const;

type AvatarFormat = 'jpeg' | 'png' | 'webp';

export interface NormalizedAvatar {
  buffer: Buffer;
  mimeType: `image/${AvatarFormat}`;
  extension: AvatarFormat;
}

function formatForMime(mimeType: string): AvatarFormat | null {
  const normalizedMime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg' || normalizedMime === 'image/pjpeg') return 'jpeg';
  if (normalizedMime === 'image/png') return 'png';
  if (normalizedMime === 'image/webp') return 'webp';
  return null;
}

function hasExactPngContainer(buffer: Buffer): boolean {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
  let offset = PNG_SIGNATURE.length;
  while (offset + PNG_CHUNK_OVERHEAD <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + PNG_CHUNK_OVERHEAD + dataLength;
    if (chunkEnd > buffer.length) return false;
    const chunkType = buffer.toString('ascii', offset + PNG_LENGTH_BYTES, offset + PNG_LENGTH_BYTES + CONTAINER_TYPE_BYTES);
    if (chunkType === 'IEND') return dataLength === 0 && chunkEnd === buffer.length;
    offset = chunkEnd;
  }
  return false;
}

function hasExactContainer(buffer: Buffer, format: AvatarFormat): boolean {
  if (format === 'jpeg') {
    return buffer.length >= JPEG_SIGNATURE.length + JPEG_END.length
      && buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)
      && buffer.subarray(-JPEG_END.length).equals(JPEG_END);
  }
  if (format === 'png') return hasExactPngContainer(buffer);
  return buffer.length >= WEBP_HEADER_LENGTH
    && buffer.toString('ascii', 0, RIFF_SIGNATURE.length) === RIFF_SIGNATURE
    && buffer.toString('ascii', WEBP_OFFSET, WEBP_OFFSET + WEBP_SIGNATURE.length) === WEBP_SIGNATURE
    && buffer.readUInt32LE(CONTAINER_TYPE_BYTES) + RIFF_CONTAINER_OVERHEAD === buffer.length;
}

/** Fast structural check; full decoding and pixel normalization happen before controller execution. */
export function isValidAvatar(buffer: Buffer, mimeType: string): boolean {
  const format = formatForMime(mimeType);
  return format !== null && hasExactContainer(buffer, format);
}

export async function validateAndNormalizeAvatar(buffer: Buffer, mimeType: string): Promise<NormalizedAvatar> {
  const expectedFormat = formatForMime(mimeType);
  if (!expectedFormat || !hasExactContainer(buffer, expectedFormat)) {
    throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.INVALID_FORMAT, 'AVATAR_INVALID_CONTENT');
  }

  try {
    const image = sharp(buffer, {
      failOn: 'error',
      limitInputPixels: env.AVATAR_MAX_PIXELS,
      sequentialRead: true,
    });
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (metadata.format !== expectedFormat || (metadata.pages ?? 1) !== 1 || width <= 0 || height <= 0) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.INVALID_FORMAT, 'AVATAR_INVALID_CONTENT');
    }
    if (width > env.AVATAR_MAX_DIMENSION || height > env.AVATAR_MAX_DIMENSION || width * height > env.AVATAR_MAX_PIXELS) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.INVALID_DIMENSIONS, 'AVATAR_DIMENSIONS_INVALID');
    }

    const decoded = image.rotate();
    const normalized = expectedFormat === 'jpeg'
      ? await decoded.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
      : expectedFormat === 'png'
        ? await decoded.png({ compressionLevel: 9 }).toBuffer()
        : await decoded.webp({ quality: 90 }).toBuffer();

    return { buffer: normalized, mimeType: `image/${expectedFormat}`, extension: expectedFormat };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'statusCode' in error) throw error;
    throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.INVALID_FORMAT, 'AVATAR_INVALID_CONTENT');
  }
}

export const uploadAvatar: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    await new Promise<void>((resolve, reject) => upload(req, res, (error?: unknown) => error ? reject(error) : resolve()));
    if (!req.file) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, AVATAR_UPLOAD_MESSAGES.REQUIRED, 'AVATAR_REQUIRED');
    }
    const normalized = await validateAndNormalizeAvatar(req.file.buffer, req.file.mimetype);
    req.file.buffer = normalized.buffer;
    req.file.size = normalized.buffer.length;
    req.file.mimetype = normalized.mimeType;
    req.file.originalname = `${path.parse(req.file.originalname).name}.${normalized.extension}`;
    next();
  } catch (error) {
    if (error instanceof multer.MulterError) {
      next(createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        error.code === 'LIMIT_FILE_SIZE' ? AVATAR_UPLOAD_MESSAGES.FILE_TOO_LARGE : AVATAR_UPLOAD_MESSAGES.INVALID_UPLOAD,
        error.code === 'LIMIT_FILE_SIZE' ? 'AVATAR_FILE_TOO_LARGE' : 'AVATAR_INVALID_UPLOAD',
      ));
      return;
    }
    next(error);
  }
};
