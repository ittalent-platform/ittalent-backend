import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import {
  recruiterApplicationsService,
  type RecruiterApplicationsService,
} from './recruiter-applications.service.js';
import type { RecruiterApplicationListQuery } from './recruiter-applications.schemas.js';

export class RecruiterApplicationsController {
  constructor(
    private readonly service: RecruiterApplicationsService = recruiterApplicationsService,
  ) {}

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
}

export const recruiterApplicationsController =
  new RecruiterApplicationsController();
