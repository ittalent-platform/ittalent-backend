import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { uploadDocument } from '../../middleware/document-upload.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validate.js';
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
  authorize('user'),
  uploadDocument,
  validateBody(documentUploadSchema),
  documentsController.upload,
);
documentsRouter.get(
  '/documents',
  authenticate,
  authorize('user'),
  validateQuery(documentListQuerySchema),
  documentsController.listMine,
);
documentsRouter.get(
  '/documents/:id/download',
  authenticate,
  authorize('user'),
  validateParams(documentIdParamSchema),
  documentsController.downloadMine,
);
documentsRouter.get(
  '/documents/:id/preview',
  authenticate,
  authorize('user'),
  validateParams(documentIdParamSchema),
  documentsController.previewMine,
);
documentsRouter.patch(
  '/documents/:id/default',
  authenticate,
  authorize('user'),
  validateParams(documentIdParamSchema),
  documentsController.setDefaultMine,
);
documentsRouter.delete(
  '/documents/:id',
  authenticate,
  authorize('user'),
  validateParams(documentIdParamSchema),
  documentsController.removeMine,
);
