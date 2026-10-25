import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import { AVATAR_MAX_BYTES, isValidAvatar, uploadAvatar } from '../../../src/middleware/avatar-upload.middleware.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

async function imageFixture(format: 'jpeg' | 'png' | 'webp', width = 2, height = 2): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: '#336699' } });
  if (format === 'jpeg') return image.jpeg().toBuffer();
  if (format === 'png') return image.png().toBuffer();
  return image.webp().toBuffer();
}

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
    ])('accepts valid JPEG buffer with MIME type %s', async (mimeType) => {
      expect(isValidAvatar(await imageFixture('jpeg'), mimeType)).toBe(true);
    });

    it('accepts structurally complete PNG and WebP buffers', async () => {
      expect(isValidAvatar(await imageFixture('png'), 'image/png')).toBe(true);
      expect(isValidAvatar(await imageFixture('webp'), 'image/webp')).toBe(true);
    });

    it('rejects mismatched signatures, unsupported types, truncation, and executable suffixes', async () => {
      const png = await imageFixture('png');
      const jpeg = await imageFixture('jpeg');
      expect(isValidAvatar(Buffer.from('not-an-image'), 'image/jpeg')).toBe(false);
      expect(isValidAvatar(png, 'image/jpeg')).toBe(false);
      expect(isValidAvatar(jpeg, 'image/gif')).toBe(false);
      expect(isValidAvatar(png.subarray(0, png.length - 2), 'image/png')).toBe(false);
      expect(isValidAvatar(Buffer.concat([png, Buffer.from('MZ')]), 'image/png')).toBe(false);
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
          message: 'Only decodable JPEG, PNG, and WebP images are accepted',
          code: 'AVATAR_INVALID_CONTENT',
        }),
      );
    });

    it('calls next() without error when a valid JPEG (image/jpg) is uploaded', async () => {
      const body = buildMultipartBody('avatar', 'photo.jpg', 'image/jpg', await imageFixture('jpeg'));
      const req = createMultipartRequest(body);
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(req.file).toBeDefined();
    });

    it('maps LIMIT_FILE_SIZE MulterError to a provider-neutral technical-limit error', async () => {
      const oversized = Buffer.alloc(AVATAR_MAX_BYTES + 1024, 0xff);
      const body = buildMultipartBody('avatar', 'huge.jpg', 'image/jpeg', oversized);
      const req = createMultipartRequest(body);
      const next = vi.fn();

      await uploadAvatar(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
          message: 'Avatar exceeds the configured technical upload limit',
          code: 'AVATAR_FILE_TOO_LARGE',
        }),
      );
    });

    it('rejects SVG and decoded images beyond the configured dimension bound', async () => {
      const svgBody = buildMultipartBody('avatar', 'image.svg', 'image/svg+xml', Buffer.from('<svg/>'));
      const svgReq = createMultipartRequest(svgBody);
      const svgNext = vi.fn();
      await uploadAvatar(svgReq, {} as Response, svgNext);
      expect(svgNext).toHaveBeenCalledWith(expect.objectContaining({ code: 'AVATAR_INVALID_CONTENT' }));

      const widePng = await imageFixture('png', 4_097, 1);
      const wideReq = createMultipartRequest(buildMultipartBody('avatar', 'wide.png', 'image/png', widePng));
      const wideNext = vi.fn();
      await uploadAvatar(wideReq, {} as Response, wideNext);
      expect(wideNext).toHaveBeenCalledWith(expect.objectContaining({ code: 'AVATAR_DIMENSIONS_INVALID' }));
    });
  });
});
