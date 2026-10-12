import type { Request, RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { INTERVIEW_MESSAGES } from './interviews.constants.js';
import type {
  CreateInterviewBody,
  InterviewCalendarQuery,
  InterviewIdParam,
  InterviewListQuery,
  InterviewLookupQuery,
  UpdateInterviewBody,
  UpdateInterviewStatusBody,
  RequestInterviewRescheduleBody,
} from './interviews.schemas.js';
import { interviewsService, type InterviewActor, type InterviewsService } from './interviews.service.js';

export class InterviewsController {
  constructor(private readonly service: InterviewsService = interviewsService) {}

  // Throws inside the handler's try block, so the 401 reaches the error handler through next().
  private actorOf(req: Request): InterviewActor {
    if (!req.user) {
      throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, INTERVIEW_MESSAGES.AUTH_REQUIRED);
    }
    return { id: req.user.id, role: req.user.role };
  }

  createInterview: RequestHandler = async (req, res, next) => {
    try {
      const body = res.locals.validated?.body as CreateInterviewBody;
      const result = await this.service.create(this.actorOf(req), body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  listInterviews: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as InterviewListQuery;
      const result = await this.service.list(this.actorOf(req), query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  calendar: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as InterviewCalendarQuery;
      const result = await this.service.calendar(this.actorOf(req), query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  listSchedulableApplications: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as InterviewLookupQuery;
      const result = await this.service.listSchedulableApplications(this.actorOf(req), query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  listInterviewers: RequestHandler = async (req, res, next) => {
    try {
      const query = res.locals.validated?.query as InterviewLookupQuery;
      const result = await this.service.listInterviewers(this.actorOf(req), query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getDetail: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as InterviewIdParam;
      const result = await this.service.getDetail(this.actorOf(req), params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateInterview: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as InterviewIdParam;
      const body = res.locals.validated?.body as UpdateInterviewBody;
      const result = await this.service.update(this.actorOf(req), params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateStatus: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as InterviewIdParam;
      const body = res.locals.validated?.body as UpdateInterviewStatusBody;
      const result = await this.service.updateStatus(this.actorOf(req), params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  requestReschedule: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as InterviewIdParam;
      const body = res.locals.validated?.body as RequestInterviewRescheduleBody;
      const result = await this.service.requestReschedule(this.actorOf(req), params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteInterview: RequestHandler = async (req, res, next) => {
    try {
      const params = res.locals.validated?.params as InterviewIdParam;
      await this.service.remove(this.actorOf(req), params.id);
      res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  };
}

export const interviewsController = new InterviewsController();
