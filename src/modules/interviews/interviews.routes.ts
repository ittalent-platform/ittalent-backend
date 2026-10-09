import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { interviewsController } from './interviews.controller.js';
import {
  interviewIdParamSchema,
  interviewResponseBodySchema,
} from './interviews.schemas.js';

export const interviewsRouter = Router();

interviewsRouter.patch(
  '/interviews/:id/respond',
  authenticate,
  authorize('user'),
  validateParams(interviewIdParamSchema),
  validateBody(interviewResponseBodySchema),
  interviewsController.respond,
);
