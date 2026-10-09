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
  authorize('recruiter'),
  validateQuery(jobPostingListQuerySchema),
  jobPostingsController.listRecruiter,
);
jobPostingsRouter.post(
  '/job-postings',
  authenticate,
  authorize('recruiter'),
  validateBody(createJobPostingSchema),
  jobPostingsController.create,
);
jobPostingsRouter.get(
  '/job-postings/:id',
  authenticate,
  authorize('admin', 'recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.getById,
);
jobPostingsRouter.patch(
  '/job-postings/:id',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  validateBody(updateJobPostingSchema),
  jobPostingsController.update,
);
jobPostingsRouter.patch(
  '/job-postings/:id/close',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.close,
);
jobPostingsRouter.patch(
  '/job-postings/:id/reopen',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.reopen,
);
jobPostingsRouter.patch(
  '/job-postings/:id/archive',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.archive,
);
jobPostingsRouter.patch(
  '/job-postings/:id/restore',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.restore,
);
jobPostingsRouter.get(
  '/job-postings/:id/history',
  authenticate,
  authorize('admin', 'recruiter'),
  validateParams(jobPostingIdParamSchema),
  validateQuery(jobPostingHistoryQuerySchema),
  jobPostingsController.history,
);
jobPostingsRouter.delete(
  '/job-postings/:id',
  authenticate,
  authorize('recruiter'),
  validateParams(jobPostingIdParamSchema),
  jobPostingsController.remove,
);
