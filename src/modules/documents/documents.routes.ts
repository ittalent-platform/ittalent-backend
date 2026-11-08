import { Router } from 'express';
import {
  authenticate,
  authenticateCurrentUser,
  authorize,
} from '../../middleware/auth.middleware.js';
import { uploadDocument } from '../../middleware/document-upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
import { CANDIDATE_ROLES } from './documents.constants.js';
import { documentsController } from './documents.controller.js';
import {
  documentIdParamSchema,
  documentListQuerySchema,
  documentUploadSchema,
} from './documents.schemas.js';

export const documentsRouter = Router();

documentsRouter.post(
  '/documents',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  uploadDocument,
  validateBody(documentUploadSchema),
  documentsController.upload,
);
documentsRouter.get(
  '/documents',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateQuery(documentListQuerySchema),
  documentsController.listMine,
);
documentsRouter.get(
  '/documents/:id/download',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(documentIdParamSchema),
  documentsController.downloadMine,
);
documentsRouter.get(
  '/documents/:id/preview',
  authenticate,
  authorize(...CANDIDATE_ROLES),
  validateParams(documentIdParamSchema),
  documentsController.previewMine,
);
documentsRouter.patch(
  '/documents/:id/default',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(documentIdParamSchema),
  documentsController.setDefaultMine,
);
documentsRouter.delete(
  '/documents/:id',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(documentIdParamSchema),
  documentsController.removeMine,
);
