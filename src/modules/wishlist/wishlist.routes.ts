import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { CANDIDATE_ROLES } from './wishlist.constants.js';
import { wishlistController } from './wishlist.controller.js';
import {
  addWishlistBodySchema,
  wishlistIdParamSchema,
  wishlistJobParamSchema,
  wishlistQuerySchema,
} from './wishlist.schemas.js';

export const wishlistRouter = Router();

wishlistRouter.post(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateBody(addWishlistBodySchema),
  wishlistController.saveJob,
);

wishlistRouter.post(
  '/toggle',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateBody(addWishlistBodySchema),
  wishlistController.toggleJob,
);

wishlistRouter.patch(
  '/jobs/:jobId/toggle',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(wishlistJobParamSchema),
  wishlistController.toggleJob,
);

wishlistRouter.get(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateQuery(wishlistQuerySchema),
  wishlistController.listMine,
);

wishlistRouter.get(
  '/jobs/:jobId',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(wishlistJobParamSchema),
  wishlistController.checkSaved,
);

wishlistRouter.delete(
  '/jobs/:jobId',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(wishlistJobParamSchema),
  wishlistController.removeJob,
);

wishlistRouter.delete(
  '/unavailable',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  wishlistController.clearUnavailable,
);

wishlistRouter.delete(
  '/:id',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateParams(wishlistIdParamSchema),
  wishlistController.removeById,
);
