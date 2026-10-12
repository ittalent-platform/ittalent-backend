import { Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadedDocument } from '../../../src/middleware/document-upload.middleware.js';
import { DocumentsController } from '../../../src/modules/documents/documents.controller.js';
import type {
  DocumentFileResult,
  DocumentsService,
} from '../../../src/modules/documents/documents.service.js';
import type { DocumentResponse } from '../../../src/modules/documents/documents.schemas.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';

const documentId = '507f1f77bcf86cd799439011';
const userId = '507f1f77bcf86cd799439012';

const documentResponse: DocumentResponse = {
  id: documentId,
  ownerId: userId,
  type: 'cv',
  fileUrl: 'https://storage.example.test/resume.pdf',
  fileName: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 42,
  isDefault: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

type MockDocumentsService = Pick<
  DocumentsService,
  'upload' | 'list' | 'download' | 'preview' | 'remove' | 'setDefault'
>;

function authenticatedRequest(validated: Record<string, unknown>): never {
  return {
    user: { id: userId, email: 'user@example.test', role: 'user' },
    locals: { validated },
  } as never;
}

function jsonResponse(): {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  locals: Record<string, unknown>;
} {
  const json = vi.fn();
  const end = vi.fn();
  return {
    status: vi.fn().mockReturnValue({ json, end }),
    json,
    end,
    locals: {},
  };
}

function fileResponse(): {
  response: Writable & {
    setHeader: ReturnType<typeof vi.fn>;
    locals: Record<string, unknown>;
  };
  content: () => string;
} {
  const chunks: Buffer[] = [];
  const response = Object.assign(
    new Writable({
      write(chunk: Buffer, _encoding, callback): void {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    }),
    { setHeader: vi.fn(), locals: {} },
  );
  return { response, content: () => Buffer.concat(chunks).toString() };
}

function file(
  name = 'resume.pdf',
  response = new Response('pdf-bytes'),
): DocumentFileResult {
  return { fileName: name, mimeType: 'application/pdf', response };
}

describe('DocumentsController', () => {
  let service: MockDocumentsService;
  let controller: DocumentsController;

  beforeEach(() => {
    service = {
      upload: vi.fn(),
      list: vi.fn(),
      download: vi.fn(),
      preview: vi.fn(),
      remove: vi.fn(),
      setDefault: vi.fn(),
    };
    controller = new DocumentsController(service as DocumentsService);
  });

  it('rejects missing authentication before invoking a protected handler', async () => {
    const res = jsonResponse();
    const next = vi.fn();

    await controller.downloadMine(
      { locals: { validated: { params: { id: documentId } } } } as never,
      res as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_401_UNAUTHORIZED }),
    );
    expect(service.download).not.toHaveBeenCalled();
  });

  it('uploads the validated document for the authenticated user', async () => {
    service.upload = vi.fn().mockResolvedValue(documentResponse);
    const res = jsonResponse();
    const next = vi.fn();
    const uploadedFile = {
      fileUrl: documentResponse.fileUrl,
      storageKey: 'documents/resume.pdf',
      fileName: documentResponse.fileName,
      mimeType: documentResponse.mimeType,
      size: documentResponse.size,
    } as UploadedDocument;
    res.locals = {
      validated: { body: { type: 'cv' } },
      uploadedDocument: uploadedFile,
    };

    await controller.upload(
      authenticatedRequest({ body: { type: 'cv' } }),
      res as never,
      next,
    );

    expect(service.upload).toHaveBeenCalledWith(userId, 'cv', uploadedFile);
    expect(res.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
    expect(res.json).toHaveBeenCalledWith(documentResponse);
    expect(next).not.toHaveBeenCalled();
  });

  it('reports a missing upload file through the error middleware', async () => {
    const res = jsonResponse();
    const next = vi.fn();
    res.locals = { validated: { body: { type: 'cv' } } };

    await controller.upload(authenticatedRequest({ body: { type: 'cv' } }), res as never, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }),
    );
  });

  it('lists only the authenticated user documents with the validated query', async () => {
    const result = { items: [documentResponse], page: 1, limit: 10, total: 1, totalPages: 1 };
    service.list = vi.fn().mockResolvedValue(result);
    const res = jsonResponse();
    const next = vi.fn();
    res.locals = { validated: { query: { page: 1, limit: 10, type: 'cv' } } };

    await controller.listMine(authenticatedRequest({ query: { page: 1, limit: 10, type: 'cv' } }), res as never, next);

    expect(service.list).toHaveBeenCalledWith(userId, { page: 1, limit: 10, type: 'cv' });
    expect(res.json).toHaveBeenCalledWith(result);
  });

  it('downloads an owned document as an attachment stream', async () => {
    service.download = vi.fn().mockResolvedValue(file());
    const { response, content } = fileResponse();
    const next = vi.fn();
    response.locals = { validated: { params: { id: documentId } } };

    await controller.downloadMine(authenticatedRequest({ params: { id: documentId } }), response as never, next);

    expect(service.download).toHaveBeenCalledWith(userId, documentId);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment;'),
    );
    expect(content()).toBe('pdf-bytes');
    expect(next).not.toHaveBeenCalled();
  });

  it('streams PDF previews inline and safely encodes special filenames', async () => {
    service.preview = vi.fn().mockResolvedValue({
      kind: 'file',
      file: file('résumé "draft".pdf'),
    });
    const { response, content } = fileResponse();
    const next = vi.fn();
    response.locals = { validated: { params: { id: documentId } } };

    await controller.previewMine(authenticatedRequest({ params: { id: documentId } }), response as never, next);

    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('inline; filename="r_sum_ draft.pdf"'),
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining("filename*=UTF-8''r%C3%A9sum%C3%A9%20draft.pdf"),
    );
    expect(content()).toBe('pdf-bytes');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns DOC/DOCX preview URLs as JSON without file-stream headers', async () => {
    const previewUrl = 'https://docs.google.com/gview?embedded=true';
    service.preview = vi.fn().mockResolvedValue({ kind: 'url', previewUrl });
    const res = jsonResponse();
    const next = vi.fn();
    res.locals = { validated: { params: { id: documentId } } };

    await controller.previewMine(authenticatedRequest({ params: { id: documentId } }), res as never, next);

    expect(res.json).toHaveBeenCalledWith({ previewUrl });
    expect((res as { setHeader?: unknown }).setHeader).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards service authorization errors and stream failures to next', async () => {
    const authorizationError = new Error('Not found');
    service.remove = vi.fn().mockRejectedValue(authorizationError);
    const removeResponse = jsonResponse();
    const removeNext = vi.fn();
    removeResponse.locals = { validated: { params: { id: documentId } } };

    await controller.removeMine(authenticatedRequest({ params: { id: documentId } }), removeResponse as never, removeNext);
    expect(removeNext).toHaveBeenCalledWith(authorizationError);

    service.preview = vi.fn().mockResolvedValue({ kind: 'file', file: file('empty.pdf', new Response(null)) });
    const { response } = fileResponse();
    const streamNext = vi.fn();
    response.locals = { validated: { params: { id: documentId } } };

    await controller.previewMine(authenticatedRequest({ params: { id: documentId } }), response as never, streamNext);
    expect(streamNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_502_BAD_GATEWAY }),
    );
  });

  it('deletes and sets the default document using the authenticated user id', async () => {
    service.remove = vi.fn().mockResolvedValue(undefined);
    service.setDefault = vi.fn().mockResolvedValue({ ...documentResponse, isDefault: true });
    const removeResponse = jsonResponse();
    const removeNext = vi.fn();
    removeResponse.locals = { validated: { params: { id: documentId } } };

    await controller.removeMine(authenticatedRequest({ params: { id: documentId } }), removeResponse as never, removeNext);
    expect(service.remove).toHaveBeenCalledWith(userId, documentId);
    expect(removeResponse.status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_204_NO_CONTENT);
    expect(removeResponse.end).toHaveBeenCalledOnce();

    const defaultResponse = jsonResponse();
    const defaultNext = vi.fn();
    defaultResponse.locals = { validated: { params: { id: documentId } } };
    await controller.setDefaultMine(authenticatedRequest({ params: { id: documentId } }), defaultResponse as never, defaultNext);
    expect(service.setDefault).toHaveBeenCalledWith(userId, documentId);
    expect(defaultResponse.json).toHaveBeenCalledWith({ ...documentResponse, isDefault: true });
  });
});
