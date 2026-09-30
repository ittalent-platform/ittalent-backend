import type { RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { jobPostingsService, type JobPostingsService } from './job-postings.service.js';
import type { CreateJobPosting, JobPostingIdParam, JobPostingListQuery, UpdateJobPosting } from './job-postings.schemas.js';

export class JobPostingsController {
  constructor(private readonly service: JobPostingsService = jobPostingsService) {}
  create: RequestHandler = async (req, res, next) => { try { if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'); res.status(HTTP_STATUS.HTTP_201_CREATED).json(await this.service.create(req.user.id, res.locals.validated?.body as CreateJobPosting)); } catch (error) { next(error); } };
  getById: RequestHandler = async (req, res, next) => { try { if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'); const { id } = res.locals.validated?.params as JobPostingIdParam; res.json(await this.service.getByIdForManagement(id, req.user.id, req.user.role)); } catch (error) { next(error); } };
  getPublic: RequestHandler = async (_req, res, next) => { try { const { id } = res.locals.validated?.params as JobPostingIdParam; res.json(await this.service.getPublicById(id)); } catch (error) { next(error); } };
  update: RequestHandler = async (req, res, next) => { try { if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'); const { id } = res.locals.validated?.params as JobPostingIdParam; res.json(await this.service.update(id, req.user.id, req.user.role, res.locals.validated?.body as UpdateJobPosting)); } catch (error) { next(error); } };
  remove: RequestHandler = async (req, res, next) => { try { if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'); const { id } = res.locals.validated?.params as JobPostingIdParam; await this.service.remove(id, req.user.id, req.user.role); res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).end(); } catch (error) { next(error); } };
  listPublic: RequestHandler = async (_req, res, next) => { try { res.json(await this.service.listPublic(res.locals.validated?.query as JobPostingListQuery)); } catch (error) { next(error); } };
  listAdmin: RequestHandler = async (_req, res, next) => { try { res.json(await this.service.listAdmin(res.locals.validated?.query as JobPostingListQuery)); } catch (error) { next(error); } };
  listRecruiter: RequestHandler = async (req, res, next) => { try { if (!req.user) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required'); res.json(await this.service.listRecruiter(req.user.id, res.locals.validated?.query as JobPostingListQuery)); } catch (error) { next(error); } };
}
export const jobPostingsController = new JobPostingsController();