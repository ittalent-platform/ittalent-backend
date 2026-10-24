import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as cloudinaryConfig from '../../../src/config/cloudinary.js';
import {
  DOC_SIGNATURE,
  OFFICE_SIGNATURE,
  PDF_SIGNATURE,
  StorageService,
  isValidDoc,
  isValidDocx,
  isValidDocumentBuffer,
  isValidPdf,
  storageService,
} from '../../../src/shared/services/storage.service.js';

describe('StorageService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('provider-neutral owned keys', () => {
    it('generates an owner-scoped key and rejects foreign traversal keys', () => {
      const service = new StorageService();
      const key = service.createOwnedKey('profile-avatars', 'user-123', 'avatar', 'png');
      expect(key).toMatch(/^profile-avatars\/user-123\/avatar-[0-9a-f-]+\.png$/);
      expect(service.ownsKey(key, 'profile-avatars', 'user-123', 'avatar')).toBe(true);
      expect(service.ownsKey('profile-avatars/other/avatar-id.png', 'profile-avatars', 'user-123', 'avatar')).toBe(false);
      expect(service.ownsKey('profile-avatars/user-123/avatar-../foreign.png', 'profile-avatars', 'user-123', 'avatar')).toBe(false);
    });
  });

  describe('Buffer Signature Helpers', () => {
    it('validates PDF signature correctly', () => {
      const validBuffer = Buffer.from(`${PDF_SIGNATURE} extra content`);
      const invalidBuffer = Buffer.from('NOT_A_PDF content');
      const shortBuffer = Buffer.from('%PD');

      expect(isValidPdf(validBuffer)).toBe(true);
      expect(isValidPdf(invalidBuffer)).toBe(false);
      expect(isValidPdf(shortBuffer)).toBe(false);
    });

    it('validates DOC signature correctly', () => {
      const validBuffer = Buffer.concat([DOC_SIGNATURE, Buffer.from('extra bytes')]);
      const invalidBuffer = Buffer.from('invalid legacy doc bytes');
      const shortBuffer = DOC_SIGNATURE.subarray(0, 4);

      expect(isValidDoc(validBuffer)).toBe(true);
      expect(isValidDoc(invalidBuffer)).toBe(false);
      expect(isValidDoc(shortBuffer)).toBe(false);
    });

    it('validates DOCX signature correctly', () => {
      const validBuffer = Buffer.concat([OFFICE_SIGNATURE, Buffer.from('extra zip entries')]);
      const invalidBuffer = Buffer.from('invalid docx archive bytes');
      const shortBuffer = OFFICE_SIGNATURE.subarray(0, 2);

      expect(isValidDocx(validBuffer)).toBe(true);
      expect(isValidDocx(invalidBuffer)).toBe(false);
      expect(isValidDocx(shortBuffer)).toBe(false);
    });

    it('validates document buffers via generic isValidDocumentBuffer helper', () => {
      const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} content`);
      const docBuffer = Buffer.concat([DOC_SIGNATURE, Buffer.from('content')]);
      const docxBuffer = Buffer.concat([OFFICE_SIGNATURE, Buffer.from('content')]);

      expect(isValidDocumentBuffer('pdf', pdfBuffer)).toBe(true);
      expect(isValidDocumentBuffer('doc', docBuffer)).toBe(true);
      expect(isValidDocumentBuffer('docx', docxBuffer)).toBe(true);

      expect(isValidDocumentBuffer('pdf', docxBuffer)).toBe(false);
      expect(isValidDocumentBuffer('doc', pdfBuffer)).toBe(false);
      expect(isValidDocumentBuffer('docx', docBuffer)).toBe(false);
    });
  });

  describe('uploadFile when unconfigured', () => {
    it('throws 503 Service Unavailable when Cloudinary is not configured', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(false);

      await expect(
        storageService.uploadFile({
          buffer: Buffer.from('sample pdf content'),
          fileName: 'resume.pdf',
          folder: 'italent/documents',
        }),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: 'Document storage is not configured',
      });
    });
  });

  describe('uploadFile when configured with Cloudinary', () => {
    it('streams buffer to Cloudinary and returns secure URL on success', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);

      const mockUploadStream = vi.fn().mockImplementation((_opts, callback) => {
        return {
          end: (buffer: Buffer) => {
            expect(buffer).toBeDefined();
            callback(null, {
              secure_url: 'https://res.cloudinary.com/test/raw/upload/v1/italent/documents/doc-123.pdf',
              public_id: 'italent/documents/doc-123.pdf',
            });
          },
        };
      });

      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: {
          upload_stream: mockUploadStream,
        },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      const dummyBuffer = Buffer.from('pdf payload');
      const result = await storageService.uploadFile({
        buffer: dummyBuffer,
        fileName: 'cv.pdf',
        folder: 'italent/documents',
      });

      expect(result.fileUrl).toBe('https://res.cloudinary.com/test/raw/upload/v1/italent/documents/doc-123.pdf');
      expect(result.storageKey).toBe('italent/documents/doc-123.pdf');
      expect(result.fileName).toBe('cv.pdf');
      expect(result.size).toBe(dummyBuffer.length);
    });

    it('passes an explicit domain-owned storage key through the provider adapter', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);
      const storageKey = 'profile-avatars/user-123/avatar-owned.png';
      const mockUploadStream = vi.fn().mockImplementation((options, callback) => ({
        end: () => {
          expect(options).toMatchObject({ public_id: storageKey, resource_type: 'image' });
          callback(null, { secure_url: 'https://example.test/avatar.png', public_id: storageKey });
        },
      }));
      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: { upload_stream: mockUploadStream },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      await expect(storageService.uploadFile({
        buffer: Buffer.from('normalized image'),
        fileName: 'avatar.png',
        resourceType: 'image',
        storageKey,
      })).resolves.toMatchObject({ storageKey });
    });

    it('throws 502 Bad Gateway when Cloudinary stream emits an error', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);

      const mockUploadStream = vi.fn().mockImplementation((_opts, callback) => {
        return {
          end: () => {
            callback(new Error('Cloudinary timeout error'), null);
          },
        };
      });

      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: {
          upload_stream: mockUploadStream,
        },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      await expect(
        storageService.uploadFile({
          buffer: Buffer.from('some data'),
          fileName: 'cv.pdf',
        }),
      ).rejects.toMatchObject({
        statusCode: 502,
        message: 'Document upload failed',
      });
    });

    it('throws 502 Bad Gateway when Cloudinary output lacks secure_url or public_id', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);

      const mockUploadStream = vi.fn().mockImplementation((_opts, callback) => {
        return {
          end: () => {
            callback(null, {}); // empty response
          },
        };
      });

      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: {
          upload_stream: mockUploadStream,
        },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      await expect(
        storageService.uploadFile({
          buffer: Buffer.from('some data'),
          fileName: 'cv.pdf',
        }),
      ).rejects.toMatchObject({
        statusCode: 502,
        message: 'Document upload failed',
      });
    });
  });

  describe('deleteFile', () => {
    it('throws 503 Service Unavailable when Cloudinary is not configured', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(false);

      await expect(
        storageService.deleteFile('italent/documents/test-123.pdf'),
      ).rejects.toMatchObject({
        statusCode: 503,
        message: 'Document storage is not configured',
      });
    });

    it('calls cloudinary destroy and returns true on successful deletion', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);

      const destroyMock = vi.fn().mockResolvedValue({ result: 'ok' });
      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: {
          destroy: destroyMock,
        },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      const result = await storageService.deleteFile('italent/documents/test-123.pdf');

      expect(destroyMock).toHaveBeenCalledWith('italent/documents/test-123.pdf', { resource_type: 'raw' });
      expect(result).toBe(true);
    });

    it('returns false and logs error when Cloudinary destroy rejects', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const destroyMock = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.spyOn(cloudinaryConfig, 'getCloudinary').mockReturnValue({
        uploader: {
          destroy: destroyMock,
        },
      } as unknown as ReturnType<typeof cloudinaryConfig.getCloudinary>);

      const result = await storageService.deleteFile('italent/documents/test-123.pdf');

      expect(result).toBe(false);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('isConfigured', () => {
    it('delegates to isCloudinaryConfigured helper', () => {
      const service = new StorageService();
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(true);
      expect(service.isConfigured()).toBe(true);

      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(false);
      expect(service.isConfigured()).toBe(false);
    });
  });
});
