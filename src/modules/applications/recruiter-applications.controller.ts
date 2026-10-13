import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type { DocumentFileResult } from '../documents/documents.service.js';
import {
  recruiterApplicationsService,
  type RecruiterApplicationsService,
} from './recruiter-applications.service.js';
import type { ApplicationIdParam } from './applications.schemas.js';
import type {
  CreateRecruiterNoteBody,
  RecruiterApplicationListQuery,
} from './recruiter-applications.schemas.js';

export class RecruiterApplicationsController {
  constructor(
    private readonly service: RecruiterApplicationsService = recruiterApplicationsService,
  ) {}

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
    if (!file.response.body) {
      throw createHttpError(
        HTTP_STATUS.HTTP_502_BAD_GATEWAY,
        'Document file has no response body',
      );
    }
    await pipeline(Readable.fromWeb(file.response.body as never), res);
  }

  list: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const query = (res.locals.validated?.query ?? req.query) as RecruiterApplicationListQuery;
      const result = await this.service.listApplications(
        user.id,
        user.role,
        query,
      );

      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetail: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const params = (res.locals.validated?.params ?? req.params) as ApplicationIdParam;
      const result = await this.service.getApplicationDetail(
        user.id,
        user.role,
        params.id,
      );

      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  downloadCv: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const params = (res.locals.validated?.params ?? req.params) as ApplicationIdParam;
      const { fileResult, metadata } = await this.service.getCvDownload(
        user.id,
        user.role,
        params.id,
      );

      if (req.query.metadata === 'true') {
        res.status(HTTP_STATUS.HTTP_200_OK).json(metadata);
        return;
      }

      await this.sendFile(res, fileResult, 'attachment');
    } catch (error) {
      next(error);
    }
  };

  addNote: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const params = (res.locals.validated?.params ?? req.params) as ApplicationIdParam;
      const body = (res.locals.validated?.body ?? req.body) as CreateRecruiterNoteBody;

      const result = await this.service.addNote(
        user.id,
        user.role,
        params.id,
        body.content,
      );

      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  listNotes: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          'Authentication required',
        );
      }

      const params = (res.locals.validated?.params ?? req.params) as ApplicationIdParam;
      const result = await this.service.listNotes(
        user.id,
        user.role,
        params.id,
      );

      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const recruiterApplicationsController =
  new RecruiterApplicationsController();
