import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { APPLICATION_MESSAGES } from './applications.constants.js';
import type {
  ApplicationHistoryQuery,
  ApplicationIdParam,
  ApplicationListQuery,
  WithdrawApplicationBody,
} from './applications.schemas.js';
import { applicationsService, type ApplicationsService } from './applications.service.js';

export class ApplicationsController {
  constructor(private readonly service: ApplicationsService = applicationsService) {}

  listMine: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
      }

      const query = res.locals.validated?.query as ApplicationListQuery;
      const result = await this.service.list(req.user.id, query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetail: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
      }

      const params = res.locals.validated?.params as ApplicationIdParam;
      const result = await this.service.getDetail(req.user.id, params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getHistory: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
      }

      const params = res.locals.validated?.params as ApplicationIdParam;
      const query = res.locals.validated?.query as ApplicationHistoryQuery;
      const result = await this.service.getHistory(req.user.id, params.id, query.page, query.limit);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  withdraw: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED);
      }

      const params = res.locals.validated?.params as ApplicationIdParam;
      const body = res.locals.validated?.body as WithdrawApplicationBody;
      const result = await this.service.withdraw(req.user.id, params.id, body.expectedVersion, body.reason);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const applicationsController = new ApplicationsController();
