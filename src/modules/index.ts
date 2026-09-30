import { Router, type Express } from 'express';
import { applicationsRouter } from './applications/index.js';
import { authRouter } from './auth/index.js';
import { documentsRouter } from './documents/index.js';
import { enterprisesRouter } from './enterprises/index.js';
import { healthRouter } from './health/index.js';
import { jobPostingsRouter } from './job-postings/index.js';
import { usersRouter } from './users/index.js';

export function registerRoutes(app: Express): void {
  const apiV1Router = Router();
  apiV1Router.use('/auth', authRouter);
  apiV1Router.use(documentsRouter);
  apiV1Router.use(jobPostingsRouter);
  apiV1Router.use('/users', usersRouter);
  apiV1Router.use('/enterprises', enterprisesRouter);
  apiV1Router.use('/applications', applicationsRouter);

  app.use(healthRouter);
  app.use('/api/v1', apiV1Router);
}
