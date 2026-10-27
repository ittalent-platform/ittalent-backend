import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';

import { uploadDocument } from '../../../src/middleware/document-upload.middleware.js';
import {
  DOC_SIGNATURE,
  OFFICE_SIGNATURE,
  PDF_SIGNATURE,
  storageService,
} from '../../../src/shared/services/storage.service.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import { createHttpError } from '../../../src/shared/errors/http-error.js';

describe('document-upload middleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects with 400 when no file is present on the request', async () => {
    const req = { headers: {} } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Document file is required',
      }),
    );
  });

  it('rejects with 400 when file is empty (size 0)', async () => {
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'empty.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 empty'),
        size: 0,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Document file is empty',
      }),
    );
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'portfolio'],
  ])('rejects %s document type before uploading', async (_label, type) => {
    const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} valid content`);
    const req = {
      headers: {},
      body: type === undefined ? {} : { type },
      file: {
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();
    const uploadSpy = vi.spyOn(storageService, 'uploadFile');

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }),
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['blank', '   '],
    ['too long', `${'a'.repeat(252)}.pdf`],
  ])('rejects a %s file name before uploading', async (_label, originalname) => {
    const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} valid content`);
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname,
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();
    const uploadSpy = vi.spyOn(storageService, 'uploadFile');

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }),
    );
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('rejects with 400 when file extension is not supported', async () => {
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('some binary data'),
        size: 16,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Only valid PDF, DOC, and DOCX files are accepted',
      }),
    );
  });

  it('accepts a file name with exactly 255 characters', async () => {
    const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} valid content`);
    const originalname = `${'a'.repeat(251)}.pdf`;
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname,
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();
    const mockUploadResult = {
      fileUrl: 'https://storage.example.com/italent/documents/document-255.pdf',
      storageKey: 'italent/documents/document-255.pdf',
      fileName: originalname,
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
    };
    const uploadSpy = vi.spyOn(storageService, 'uploadFile').mockResolvedValue(mockUploadResult);

    await uploadDocument(req, res, next);

    expect(uploadSpy).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 400 when file mimetype does not match extension', async () => {
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'document.pdf',
        mimetype: 'image/png', // spoofed or mismatched mime
        buffer: Buffer.from('%PDF-1.5 test'),
        size: 14,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Only valid PDF, DOC, and DOCX files are accepted',
      }),
    );
  });

  it('rejects with 400 when buffer magic bytes do not match PDF signature', async () => {
    const req = {
      headers: {},
      body: { type: 'cover_letter' },
      file: {
        originalname: 'corrupt.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('NOT_A_PDF content'),
        size: 17,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Only valid PDF, DOC, and DOCX files are accepted',
      }),
    );
  });

  it('rejects with 400 when buffer magic bytes do not match DOC signature', async () => {
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'corrupt.doc',
        mimetype: 'application/msword',
        buffer: Buffer.from('invalid word bytes'),
        size: 18,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Only valid PDF, DOC, and DOCX files are accepted',
      }),
    );
  });

  it('rejects with 400 when buffer magic bytes do not match DOCX signature', async () => {
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'corrupt.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('invalid docx archive bytes'),
        size: 26,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: 'Only valid PDF, DOC, and DOCX files are accepted',
      }),
    );
  });

  it('successfully uploads valid PDF, sets res.locals.uploadedDocument and calls next()', async () => {
    const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} valid content`);
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'my-resume.pdf',
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    const mockUploadResult = {
      fileUrl: 'https://storage.example.com/italent/documents/document-123.pdf',
      storageKey: 'italent/documents/document-123.pdf',
      fileName: 'my-resume.pdf',
      mimeType: 'application/pdf',
      size: pdfBuffer.length,
    };

    const uploadSpy = vi.spyOn(storageService, 'uploadFile').mockResolvedValue(mockUploadResult);

    await uploadDocument(req, res, next);

    expect(uploadSpy).toHaveBeenCalledWith({
      buffer: pdfBuffer,
      fileName: 'my-resume.pdf',
      folder: 'italent/documents',
      prefix: 'document',
      resourceType: 'raw',
      mimeType: 'application/pdf',
    });

    expect(res.locals.uploadedDocument).toEqual(mockUploadResult);
    expect(next).toHaveBeenCalledWith();
  });

  it('successfully uploads valid DOC file and attaches to res.locals', async () => {
    const docBuffer = Buffer.concat([DOC_SIGNATURE, Buffer.from('valid doc content')]);
    const req = {
      headers: {},
      body: { type: 'cover_letter' },
      file: {
        originalname: 'my-cover-letter.doc',
        mimetype: 'application/msword',
        buffer: docBuffer,
        size: docBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    const mockUploadResult = {
      fileUrl: 'https://storage.example.com/italent/documents/document-456.doc',
      storageKey: 'italent/documents/document-456.doc',
      fileName: 'my-cover-letter.doc',
      mimeType: 'application/msword',
      size: docBuffer.length,
    };

    vi.spyOn(storageService, 'uploadFile').mockResolvedValue(mockUploadResult);

    await uploadDocument(req, res, next);

    expect(res.locals.uploadedDocument).toEqual(mockUploadResult);
    expect(next).toHaveBeenCalledWith();
  });

  it('successfully uploads valid DOCX file and attaches to res.locals', async () => {
    const docxBuffer = Buffer.concat([OFFICE_SIGNATURE, Buffer.from('valid docx content')]);
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'my-profile.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: docxBuffer,
        size: docxBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    const mockUploadResult = {
      fileUrl: 'https://storage.example.com/italent/documents/document-789.docx',
      storageKey: 'italent/documents/document-789.docx',
      fileName: 'my-profile.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: docxBuffer.length,
    };

    vi.spyOn(storageService, 'uploadFile').mockResolvedValue(mockUploadResult);

    await uploadDocument(req, res, next);

    expect(res.locals.uploadedDocument).toEqual(mockUploadResult);
    expect(next).toHaveBeenCalledWith();
  });

  it('forwards 502 error to next() when storageService.uploadFile fails', async () => {
    const pdfBuffer = Buffer.from(`${PDF_SIGNATURE} test`);
    const req = {
      headers: {},
      body: { type: 'cv' },
      file: {
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        buffer: pdfBuffer,
        size: pdfBuffer.length,
      },
    } as unknown as Request;
    const res = { locals: {} } as unknown as Response;
    const next = vi.fn();

    vi.spyOn(storageService, 'uploadFile').mockRejectedValue(
      createHttpError(HTTP_STATUS.HTTP_502_BAD_GATEWAY, 'Document upload failed'),
    );

    await uploadDocument(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HTTP_STATUS.HTTP_502_BAD_GATEWAY,
        message: 'Document upload failed',
      }),
    );
  });
});
