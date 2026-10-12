import { Router, type Express } from 'express';
import {
  applicationsRouter,
  recruiterApplicationsRouter,
} from './applications/index.js';
import { certificateLinksRouter } from './certificate-links/index.js';
import { authRouter } from './auth/index.js';
import { documentsRouter } from './documents/index.js';
import { enterpriseRegistrationsRouter } from './enterprise-registrations/index.js';
import { enterprisesRouter } from './enterprises/index.js';
import { healthRouter } from './health/index.js';
import { interviewsRouter } from './interviews/index.js';
import { jobPostingsRouter } from './job-postings/index.js';
import { usersRouter } from './users/index.js';
import { userInvitationsRouter } from './user-invitations/user-invitations.routes.js';
import { userAuditsRouter } from './user-audits/user-audits.routes.js';
import { userEmailChangesRouter } from './user-email-changes/user-email-changes.routes.js';

export function registerRoutes(app: Express): void {
  const apiV1Router = Router();
  apiV1Router.use('/auth', authRouter);
  apiV1Router.use(documentsRouter);
  apiV1Router.use(jobPostingsRouter);
  apiV1Router.use('/users', userAuditsRouter);
  apiV1Router.use('/users', usersRouter);
  apiV1Router.use(userInvitationsRouter);
  apiV1Router.use(userEmailChangesRouter);
  apiV1Router.use('/enterprises', enterprisesRouter);
  apiV1Router.use('/enterprise-registrations', enterpriseRegistrationsRouter);
  apiV1Router.use('/me/applications', applicationsRouter);
  apiV1Router.use(certificateLinksRouter);
  apiV1Router.use(recruiterApplicationsRouter);
  apiV1Router.use('/interviews', interviewsRouter);

  app.use(healthRouter);
  app.use('/api/v1', apiV1Router);
}
