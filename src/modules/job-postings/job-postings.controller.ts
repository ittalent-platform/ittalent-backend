import type { RequestHandler } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { jobPostingsService, type JobPostingsService } from './job-postings.service.js';
import type { CreateJobPosting, JobPostingIdParam, JobPostingListQuery, UpdateJobPosting } from './job-postings.schemas.js';

export class JobPostingsController {
  constructor(private readonly service: JobPostingsService = jobPostingsService) {}
  create: RequestHandler = async (req, res, next) => { try { if (!req.user) throw new Error('Authentication required'); res.status(HTTP_STATUS.HTTP_201_CREATED).json(await this.service.create(req.user.id, res.locals.validated?.body as CreateJobPosting)); } catch (error) { next(error); } };
  getById: RequestHandler = async (_req, res, next) => { try { const { id } = res.locals.validated?.params as JobPostingIdParam; res.json(await this.service.getById(id)); } catch (error) { next(error); } };
  update: RequestHandler = async (_req, res, next) => { try { const { id } = res.locals.validated?.params as JobPostingIdParam; res.json(await this.service.update(id, res.locals.validated?.body as UpdateJobPosting)); } catch (error) { next(error); } };
  remove: RequestHandler = async (_req, res, next) => { try { const { id } = res.locals.validated?.params as JobPostingIdParam; await this.service.remove(id); res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).end(); } catch (error) { next(error); } };
  listPublic: RequestHandler = async (_req, res, next) => { try { res.json(await this.service.list(res.locals.validated?.query as JobPostingListQuery, true)); } catch (error) { next(error); } };
  listAdmin: RequestHandler = async (_req, res, next) => { try { res.json(await this.service.list(res.locals.validated?.query as JobPostingListQuery, false)); } catch (error) { next(error); } };
}
export const jobPostingsController = new JobPostingsController();
