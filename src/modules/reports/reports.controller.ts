import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { REPORT_MESSAGES } from './reports.constants.js';
import type { CreateReportBody } from './reports.schemas.js';
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
}

export const reportsController = new ReportsController();
