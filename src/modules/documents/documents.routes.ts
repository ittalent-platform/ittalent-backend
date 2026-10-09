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
  uploadDocument,
  validateBody(documentUploadSchema),
  documentsController.upload,
);
documentsRouter.get(
  '/documents',
  authenticate,
  validateQuery(documentListQuerySchema),
  documentsController.listMine,
);
documentsRouter.get(
  '/documents/:id/download',
  authenticate,
  validateParams(documentIdParamSchema),
  documentsController.downloadMine,
);
documentsRouter.get(
  '/documents/:id/preview',
  authenticate,
  validateParams(documentIdParamSchema),
  documentsController.previewMine,
);
documentsRouter.patch(
  '/documents/:id/default',
  authenticate,
  validateParams(documentIdParamSchema),
  documentsController.setDefaultMine,
);
documentsRouter.delete(
  '/documents/:id',
  authenticate,
  validateParams(documentIdParamSchema),
  documentsController.removeMine,
);
documentsRouter.get(
  '/admin/documents',
  authenticate,
  authorize('admin'),
  validateQuery(documentListQuerySchema),
  documentsController.listAdmin,
);
documentsRouter.get(
  '/admin/documents/:id/download',
  authenticate,
  authorize('admin'),
  validateParams(documentIdParamSchema),
  documentsController.downloadAdmin,
);
documentsRouter.get(
  '/admin/documents/:id/preview',
  authenticate,
  authorize('admin'),
  validateParams(documentIdParamSchema),
  documentsController.previewAdmin,
);
