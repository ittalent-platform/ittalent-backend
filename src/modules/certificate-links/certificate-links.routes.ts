import { Router } from 'express';
import { authenticate, authenticateCurrentUser } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { certificateLinksController } from './certificate-links.controller.js';
import { certificateLinkIdParamSchema, certificateLinkListQuerySchema, createCertificateLinkSchema, deleteCertificateLinkQuerySchema, updateCertificateLinkSchema } from './certificate-links.schemas.js';

export const certificateLinksRouter = Router();

certificateLinksRouter.post('/me/certificate-links', authenticate, authenticateCurrentUser, validateBody(createCertificateLinkSchema), certificateLinksController.create);
certificateLinksRouter.get('/me/certificate-links', authenticate, authenticateCurrentUser, validateQuery(certificateLinkListQuerySchema), certificateLinksController.list);
certificateLinksRouter.patch('/me/certificate-links/:id', authenticate, authenticateCurrentUser, validateParams(certificateLinkIdParamSchema), validateBody(updateCertificateLinkSchema), certificateLinksController.update);
certificateLinksRouter.delete('/me/certificate-links/:id', authenticate, authenticateCurrentUser, validateParams(certificateLinkIdParamSchema), validateQuery(deleteCertificateLinkQuerySchema), certificateLinksController.remove);
