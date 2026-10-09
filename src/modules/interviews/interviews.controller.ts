import type { RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { INTERVIEW_MESSAGES } from './interviews.constants.js';
import type {
  InterviewIdParam,
  InterviewResponseBody,
} from './interviews.schemas.js';
import {
  interviewsService,
  type InterviewsService,
} from './interviews.service.js';

export class InterviewsController {
  constructor(
    private readonly service: InterviewsService = interviewsService,
  ) {}

  respond: RequestHandler = async (req, res, next): Promise<void> => {
    try {
      if (!req.user)
        throw createHttpError(
          HTTP_STATUS.HTTP_401_UNAUTHORIZED,
          INTERVIEW_MESSAGES.AUTH_REQUIRED,
        );
      const { id } = res.locals.validated?.params as InterviewIdParam;
      res.json(
        await this.service.respond(
          id,
          req.user.id,
          res.locals.validated?.body as InterviewResponseBody,
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}

export const interviewsController = new InterviewsController();
