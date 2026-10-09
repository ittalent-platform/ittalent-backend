import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { RequestHandler } from 'express';

import type { UploadedDocument } from '../../middleware/document-upload.middleware.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type {
  DocumentIdParam,
  DocumentListQuery,
  DocumentUpload,
} from './documents.schemas.js';
import {
  documentsService,
  type DocumentFileResult,
  type DocumentsService,
} from './documents.service.js';

export class DocumentsController {
  constructor(private readonly service: DocumentsService = documentsService) {}

  private userId(req: Parameters<RequestHandler>[0]): string {
    if (!req.user)
      throw createHttpError(
        HTTP_STATUS.HTTP_401_UNAUTHORIZED,
        'Authentication required',
      );
    return req.user.id;
  }

  private contentDisposition(
    kind: 'attachment' | 'inline',
    fileName: string,
  ): string {
    const safeName =
      fileName
        .replace(/[\r\n"]/g, '')
        .replace(/[\\/:*?<>|]/g, '_')
        .trim() || 'document';
    const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_');
    return `${kind}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
  }

  private async sendFile(
    res: Parameters<RequestHandler>[1],
    file: DocumentFileResult,
    kind: 'attachment' | 'inline',
  ): Promise<void> {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      this.contentDisposition(kind, file.fileName),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const length = file.response.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    if (!file.response.body)
      throw createHttpError(
        HTTP_STATUS.HTTP_502_BAD_GATEWAY,
        'Document file has no response body',
      );
    await pipeline(Readable.fromWeb(file.response.body), res);
  }

  upload: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const input = res.locals.validated?.body as DocumentUpload;
      const file = res.locals.uploadedDocument as UploadedDocument | undefined;
      if (!file) {
        throw createHttpError(
          HTTP_STATUS.HTTP_400_BAD_REQUEST,
          'Document file is required',
        );
      }

      res
        .status(HTTP_STATUS.HTTP_201_CREATED)
        .json(await this.service.upload(req.user.id, input.type, file));
    } catch (error) {
      next(error);
    }
  };

  listMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      res.json(
        await this.service.list(
          req.user.id,
          res.locals.validated?.query as DocumentListQuery,
        ),
      );
    } catch (error) {
      next(error);
    }
  };

  downloadMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      const { id } = res.locals.validated?.params as DocumentIdParam;
      await this.sendFile(
        res,
        await this.service.download(this.userId(req), id),
        'attachment',
      );
    } catch (error) {
      next(error);
    }
  };

  previewMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      const { id } = res.locals.validated?.params as DocumentIdParam;
      const preview = await this.service.preview(this.userId(req), id);
      if (preview.kind === 'url') res.json({ previewUrl: preview.previewUrl });
      else await this.sendFile(res, preview.file, 'inline');
    } catch (error) {
      next(error);
    }
  };

  removeMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      const { id } = res.locals.validated?.params as DocumentIdParam;
      await this.service.remove(this.userId(req), id);
      res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).end();
    } catch (error) {
      next(error);
    }
  };

  setDefaultMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      const { id } = res.locals.validated?.params as DocumentIdParam;
      res.json(await this.service.setDefault(this.userId(req), id));
    } catch (error) {
      next(error);
    }
  };
}

export const documentsController = new DocumentsController();
