import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { REPORT_MESSAGES } from './reports.constants.js';
import type { CreateReportBody, ReportIdParam, ReportsQuery } from './reports.schemas.js';
import { reportsService, type ReportsService } from './reports.service.js';

export class ReportsController {
  constructor(private readonly service: ReportsService = reportsService) {}

  submitReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, REPORT_MESSAGES.AUTH_REQUIRED);
      }

      const body = req.body as CreateReportBody;
      const files = req.files as Express.Multer.File[] | undefined;

      const result = await this.service.submitReport(req.user.id, body, files);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  listReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, REPORT_MESSAGES.AUTH_REQUIRED);
      }

      const query = req.query as unknown as ReportsQuery;
      const result = await this.service.listReports(req.user.id, query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getReportDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, REPORT_MESSAGES.AUTH_REQUIRED);
      }

      const { id } = req.params as ReportIdParam;
      const result = await this.service.getReportDetail(req.user.id, id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  withdrawReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, REPORT_MESSAGES.AUTH_REQUIRED);
      }

      const { id } = req.params as ReportIdParam;
      const note = typeof req.body?.note === 'string' ? req.body.note : undefined;

      const result = await this.service.withdrawReport(req.user.id, id, note);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  hideReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, REPORT_MESSAGES.AUTH_REQUIRED);
      }

      const { id } = req.params as ReportIdParam;
      const result = await this.service.hideReport(req.user.id, id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const reportsController = new ReportsController();
