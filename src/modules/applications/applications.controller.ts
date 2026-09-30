import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { APPLICATION_MESSAGES } from './applications.constants.js';
import type { CreateApplicationBody, MyApplicationQuery } from './applications.schemas.js';
import { applicationsService, type ApplicationsService } from './applications.service.js';

export class ApplicationsController {
  constructor(private readonly service: ApplicationsService = applicationsService) {}

  createApplication: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }

      const body = res.locals.validated?.body as CreateApplicationBody;
      const result = await this.service.applyToJob(user.id, body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  getMyApplication: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        next(createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, APPLICATION_MESSAGES.AUTH_REQUIRED));
        return;
      }

      const query = res.locals.validated?.query as MyApplicationQuery;
      const item = await this.service.findMyApplication(user.id, query.jobPostingId);
      res.json({ item });
    } catch (error) {
      next(error);
    }
  };
}

export const applicationsController = new ApplicationsController();