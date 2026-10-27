import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isAllowedReportFile,
  parseReportEvidenceUpload,
} from '../../../src/middleware/report-upload.middleware.js';

describe('Report Evidence Upload Middleware', () => {
  describe('isAllowedReportFile', () => {
    it('accepts valid screenshot images (png, jpg, jpeg, webp)', () => {
      expect(isAllowedReportFile('chat-screenshot.png', 'image/png')).toBe(true);
      expect(isAllowedReportFile('photo.jpg', 'image/jpeg')).toBe(true);
      expect(isAllowedReportFile('photo.jpeg', 'image/jpeg')).toBe(true);
      expect(isAllowedReportFile('screen.webp', 'image/webp')).toBe(true);
    });

    it('accepts valid document files (pdf, doc, docx)', () => {
      expect(isAllowedReportFile('call-notes.pdf', 'application/pdf')).toBe(true);
      expect(isAllowedReportFile('doc.doc', 'application/msword')).toBe(true);
      expect(
        isAllowedReportFile(
          'contract.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ).toBe(true);
    });

    it('rejects executable and unsupported file types', () => {
      expect(isAllowedReportFile('recording.exe', 'application/x-msdownload')).toBe(false);
      expect(isAllowedReportFile('script.sh', 'application/x-sh')).toBe(false);
      expect(isAllowedReportFile('archive.zip', 'application/zip')).toBe(false);
    });

    it('rejects mismatched extension and MIME type', () => {
      expect(isAllowedReportFile('fake.png', 'application/pdf')).toBe(false);
    });
  });

  describe('parseReportEvidenceUpload', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
      mockReq = {
        headers: {},
        files: [],
      };
      mockRes = {};
      next = vi.fn();
    });

    it('passes through when no files are uploaded (files are optional)', async () => {
      mockReq.files = [];
      await parseReportEvidenceUpload(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('passes when valid evidence files are attached', async () => {
      mockReq.files = [
        {
          fieldname: 'files',
          originalname: 'call-notes.pdf',
          mimetype: 'application/pdf',
          size: 1024,
          buffer: Buffer.from('%PDF-1.4 test content'),
        } as Express.Multer.File,
      ];

      await parseReportEvidenceUpload(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('rejects unsupported file with canonical design error message', async () => {
      mockReq.files = [
        {
          fieldname: 'files',
          originalname: 'recording.exe',
          mimetype: 'application/x-msdownload',
          size: 2048,
          buffer: Buffer.from('MZ binary'),
        } as Express.Multer.File,
      ];

      await parseReportEvidenceUpload(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'recording.exe can’t be added. Use a screenshot or a document.',
        }),
      );
    });

    it('rejects empty file (0 bytes)', async () => {
      mockReq.files = [
        {
          fieldname: 'files',
          originalname: 'empty.pdf',
          mimetype: 'application/pdf',
          size: 0,
          buffer: Buffer.alloc(0),
        } as Express.Multer.File,
      ];

      await parseReportEvidenceUpload(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'empty.pdf is empty',
        }),
      );
    });
  });
});
