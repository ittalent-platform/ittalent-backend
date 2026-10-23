import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { AVATAR_MAX_BYTES, isValidAvatar, uploadAvatar } from '../../../src/middleware/avatar-upload.middleware.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const VALID_WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii')]);

function createMultipartRequest(body?: Buffer, boundary = '----TestBoundary'): Request {
  const stream = Readable.from(body ? [body] : []);
  return Object.assign(stream, {
    headers: body
      ? {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': String(body.length),
        }
      : {},
  }) as unknown as Request;
}

function buildMultipartBody(
  fieldName: string,
  fileName: string,
  mimeType: string,
  content: Buffer,
  boundary = '----TestBoundary',
): Buffer {
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return Buffer.concat([header, content, footer]);
}

describe('avatar-upload.middleware', () => {
  describe('isValidAvatar', () => {
    it.each([
      'image/jpeg',
      'IMAGE/JPEG',
      'image/jpg',
      'image/pjpeg',
      'image/jpeg; charset=binary',
    ])('accepts valid JPEG buffer with MIME type %s', (mimeType) => {
      expect(isValidAvatar(VALID_JPEG, mimeType)).toBe(true);
    });

    it('accepts valid PNG and WebP buffers', () => {
      expect(isValidAvatar(VALID_PNG, 'image/png')).toBe(true);
      expect(isValidAvatar(VALID_WEBP, 'image/webp')).toBe(true);
    });

    it('rejects mismatched signature or unsupported MIME types', () => {
      expect(isValidAvatar(Buffer.from('not-an-image'), 'image/jpeg')).toBe(false);
      expect(isValidAvatar(VALID_PNG, 'image/jpeg')).toBe(false);
      expect(isValidAvatar(VALID_JPEG, 'image/gif')).toBe(false);
    });
  });

  describe('uploadAvatar middleware', () => {
    it('rejects with 400 "Avatar file is required" when no file is uploaded', async () => {
      const req = createMultipartRequest();
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: 'Avatar file is required',
        }),
      );
    });

    it('rejects with 400 when uploaded file signature does not match', async () => {
      const body = buildMultipartBody('avatar', 'fake.jpg', 'image/jpeg', Buffer.from('not-jpeg'));
      const req = createMultipartRequest(body);
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: 'Only valid JPEG, PNG, and WebP images are accepted',
        }),
      );
    });

    it('calls next() without error when a valid JPEG (image/jpg) is uploaded', async () => {
      const body = buildMultipartBody('avatar', 'photo.jpg', 'image/jpg', VALID_JPEG);
      const req = createMultipartRequest(body);
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(req.file).toBeDefined();
    });

    it('maps LIMIT_FILE_SIZE MulterError to 400 "Avatar file cannot exceed 5MB"', async () => {
      const oversized = Buffer.alloc(AVATAR_MAX_BYTES + 1024, 0xff);
      const body = buildMultipartBody('avatar', 'huge.jpg', 'image/jpeg', oversized);
      const req = createMultipartRequest(body);
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: 'Avatar file cannot exceed 5MB',
        }),
      );
    });
  });
});
