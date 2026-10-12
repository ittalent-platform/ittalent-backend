import { Router } from 'express';

import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { INTERVIEW_MANAGER_ROLE } from './interviews.constants.js';
import { interviewsController } from './interviews.controller.js';
import {
  createInterviewBodyValidator,
  interviewCalendarQueryValidator,
  interviewIdParamSchema,
  interviewListQueryValidator,
  interviewLookupQuerySchema,
  updateInterviewBodyValidator,
  updateInterviewStatusBodySchema,
} from './interviews.schemas.js';

export const interviewsRouter = Router();

// Only a recruiter (HR) can use these endpoints, and only for the interviews of their own enterprise.
const manageInterviews = [authenticate, authorize(INTERVIEW_MANAGER_ROLE)];

// POST creates a new interview and emails the applicant and the interviewers.
interviewsRouter.post('/', ...manageInterviews, validateBody(createInterviewBodyValidator), interviewsController.createInterview);

// List view (paginated) and Calendar view (a date window). Both take the same search and filters.
interviewsRouter.get('/', ...manageInterviews, validateQuery(interviewListQueryValidator), interviewsController.listInterviews);
// Registered before /:id so "calendar" is not read as an interview id.
interviewsRouter.get('/calendar', ...manageInterviews, validateQuery(interviewCalendarQueryValidator), interviewsController.calendar);

// The pickers of the Schedule dialog: which application, and which colleagues as interviewers.
interviewsRouter.get(
  '/applications',
  ...manageInterviews,
  validateQuery(interviewLookupQuerySchema),
  interviewsController.listSchedulableApplications,
);
interviewsRouter.get('/interviewers', ...manageInterviews, validateQuery(interviewLookupQuerySchema), interviewsController.listInterviewers);

interviewsRouter.get('/:id', ...manageInterviews, validateParams(interviewIdParamSchema), interviewsController.getDetail);

interviewsRouter.patch(
  '/:id',
  ...manageInterviews,
  validateParams(interviewIdParamSchema),
  validateBody(updateInterviewBodyValidator),
  interviewsController.updateInterview,
);

// A state transition, so PATCH rather than POST.
interviewsRouter.patch(
  '/:id/status',
  ...manageInterviews,
  validateParams(interviewIdParamSchema),
  validateBody(updateInterviewStatusBodySchema),
  interviewsController.updateStatus,
);

interviewsRouter.delete('/:id', ...manageInterviews, validateParams(interviewIdParamSchema), interviewsController.deleteInterview);
