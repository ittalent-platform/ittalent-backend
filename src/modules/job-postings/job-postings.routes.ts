import { Router } from 'express';

import { validateParams, validateQuery } from '../../middleware/validate.js';
import { jobPostingsController } from './job-postings.controller.js';
import { jobPostingIdParamSchema, jobPostingListQuerySchema } from './job-postings.schemas.js';

// Public routes: Guests and Applicants can browse; no authentication required.
export const jobPostingsRouter = Router();

jobPostingsRouter.get('/', validateQuery(jobPostingListQuerySchema), jobPostingsController.listJobPostings);
jobPostingsRouter.get(
  '/:jobPostingId',
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.getJobPostingById,
);