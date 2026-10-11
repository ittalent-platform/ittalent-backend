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

  describe('uploadFile in dev mode (unconfigured)', () => {
    it('returns a mock URL and logs [storage:dev] when Cloudinary is not configured', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const dummyBuffer = Buffer.from('sample pdf content');
      const result = await storageService.uploadFile({
        buffer: dummyBuffer,
        fileName: 'resume.pdf',
        folder: 'italent/documents',
        prefix: 'candidate-cv',
        mimeType: 'application/pdf',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[storage:dev]',
        expect.objectContaining({
          folder: 'italent/documents',
          fileName: 'resume.pdf',
          size: dummyBuffer.length,
        }),
      );

      expect(result.fileName).toBe('resume.pdf');
      expect(result.mimeType).toBe('application/pdf');
      expect(result.size).toBe(dummyBuffer.length);
      expect(result.storageKey).toMatch(/^italent\/documents\/candidate-cv-[0-9a-f-]+\.pdf$/);
      expect(result.fileUrl).toContain('/mock-storage/italent/documents/candidate-cv-');
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
    it('logs [storage:dev:delete] and returns true in dev mode', async () => {
      vi.spyOn(cloudinaryConfig, 'isCloudinaryConfigured').mockReturnValue(false);
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const result = await storageService.deleteFile('italent/documents/test-123.pdf');

      expect(result).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith('[storage:dev:delete]', {
        storageKey: 'italent/documents/test-123.pdf',
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
