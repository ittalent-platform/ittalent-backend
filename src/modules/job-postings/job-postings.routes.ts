import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { jobPostingsController } from './job-postings.controller.js';
import {
  createJobPostingSchema,
  jobPostingHistoryQuerySchema,
  jobPostingIdParamSchema,
  jobPostingListQuerySchema,
  updateJobPostingSchema,
} from './job-postings.schemas.js';
import { JOB_POSTING_MANAGER_ROLES } from './job-postings.constants.js';

export const jobPostingsRouter = Router();
jobPostingsRouter.get(
  '/job-postings',
  validateQuery(jobPostingListQuerySchema),
  jobPostingsController.listPublic,
);
jobPostingsRouter.get(
  '/job-postings/:id/public',
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.getPublic,
);
jobPostingsRouter.get(
  '/admin/job-postings',
  authenticate,
  authorize('admin'),
  validateQuery(jobPostingListQuerySchema),
  jobPostingsController.listAdmin,
);
jobPostingsRouter.get(
  '/recruiter/job-postings',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateQuery(jobPostingListQuerySchema),
  jobPostingsController.listRecruiter,
);
jobPostingsRouter.post(
  '/job-postings',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateBody(createJobPostingSchema),
  jobPostingsController.create,
);
jobPostingsRouter.get(
  '/job-postings/:id',
  authenticate,
  authorize('admin', ...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.getById,
);
jobPostingsRouter.patch(
  '/job-postings/:id',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  validateBody(updateJobPostingSchema),
  jobPostingsController.update,
);
jobPostingsRouter.patch(
  '/job-postings/:id/close',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.close,
);
jobPostingsRouter.patch(
  '/job-postings/:id/reopen',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.reopen,
);
jobPostingsRouter.patch(
  '/job-postings/:id/archive',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.archive,
);
jobPostingsRouter.patch(
  '/job-postings/:id/restore',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.restore,
);
jobPostingsRouter.get(
  '/job-postings/:id/history',
  authenticate,
  authorize('admin', ...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  validateQuery(jobPostingHistoryQuerySchema),
  jobPostingsController.history,
);
jobPostingsRouter.delete(
  '/job-postings/:id',
  authenticate,
  authorize(...JOB_POSTING_MANAGER_ROLES),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.remove,
);
