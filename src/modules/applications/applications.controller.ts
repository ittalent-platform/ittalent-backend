import type { Request, RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  APPLICATION_IDEMPOTENCY_KEY_HEADER,
  APPLICATION_IDEMPOTENCY_REPLAYED_HEADER,
  APPLICATION_MESSAGES,
} from './applications.constants.js';
import {
  applicationIdempotencyKeySchema,
  type ApplicationHistoryQuery,
  type ApplicationIdParam,
  type ApplicationListQuery,
  type CreateApplicationBody,
  type WithdrawApplicationBody,
} from './applications.schemas.js';
import { applicationsService, type ApplicationsService } from './applications.service.js';

export class ApplicationsController {
  constructor(private readonly service: ApplicationsService = applicationsService) {}

  // BR-APP-009: optional. A header that is present but not a usable key is refused rather than ignored, so a
  // client never believes it has retry protection that it does not have.
  private idempotencyKeyOf(req: Request): string | undefined {
    const raw = req.get(APPLICATION_IDEMPOTENCY_KEY_HEADER);
    if (raw === undefined) return undefined;
    const key = applicationIdempotencyKeySchema.safeParse(raw);
    if (!key.success) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, APPLICATION_MESSAGES.IDEMPOTENCY_KEY_INVALID);
    }
    return key.data;
  }

  createApplication: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }

      const body = res.locals.validated?.body as CreateApplicationBody;
      const result = await this.service.applyToJob(user.id, body, this.idempotencyKeyOf(req));
      if (result.replayed) res.setHeader(APPLICATION_IDEMPOTENCY_REPLAYED_HEADER, 'true');
      res.status(result.replayed ? HTTP_STATUS.HTTP_200_OK : HTTP_STATUS.HTTP_201_CREATED).json(result.item);
    } catch (error) {
      next(error);
    }
  };

  listMine: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }
      const query = res.locals.validated?.query as ApplicationListQuery;
      const result = await this.service.list(user.id, query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetail: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }
      const params = res.locals.validated?.params as ApplicationIdParam;
      const result = await this.service.getDetail(user.id, params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getHistory: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }
      const params = res.locals.validated?.params as ApplicationIdParam;
      const query = res.locals.validated?.query as ApplicationHistoryQuery;
      const result = await this.service.getHistory(user.id, params.id, query.page, query.limit);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  withdraw: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }
      const params = res.locals.validated?.params as ApplicationIdParam;
      const body = res.locals.validated?.body as WithdrawApplicationBody;
      const result = await this.service.withdraw(user.id, params.id, body.expectedVersion, body.reason);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const applicationsController = new ApplicationsController();