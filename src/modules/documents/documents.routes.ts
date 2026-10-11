import { Router } from 'express';
import { authenticate, authenticateCurrentUser, authorize } from '../../middleware/auth.middleware.js';
import { uploadDocument } from '../../middleware/document-upload.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { documentsController } from './documents.controller.js';
import { documentListQuerySchema, documentUploadSchema } from './documents.schemas.js';

export const documentsRouter = Router();

documentsRouter.post('/documents', authenticate, authenticateCurrentUser, uploadDocument, validateBody(documentUploadSchema), documentsController.upload);
documentsRouter.get('/documents', authenticate, authenticateCurrentUser, validateQuery(documentListQuerySchema), documentsController.listMine);
documentsRouter.get('/admin/documents', authenticate, authenticateCurrentUser, authorize('admin'), validateQuery(documentListQuerySchema), documentsController.listAdmin);
