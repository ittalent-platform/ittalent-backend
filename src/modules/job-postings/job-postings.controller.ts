import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { jobPostingsService, type JobPostingsService } from './job-postings.service.js';
import type { JobPostingIdParam, JobPostingListQuery } from './job-postings.schemas.js';

export class JobPostingsController {
  constructor(private readonly service: JobPostingsService = jobPostingsService) {}

  listJobPostings: RequestHandler = async (_req, res, next) => {
    try {
      const query = res.locals.validated?.query as JobPostingListQuery;
      const result = await this.service.listJobPostings(query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getJobPostingById: RequestHandler = async (_req, res, next) => {
    try {
      const params = res.locals.validated?.params as JobPostingIdParam;
      const result = await this.service.getJobPostingById(params.jobPostingId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const jobPostingsController = new JobPostingsController();