import { Router } from 'express';

import { authenticate, authenticateCurrentUser, authorize } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validate.js';
import { CANDIDATE_ROLES } from './wishlist.constants.js';
import { wishlistController } from './wishlist.controller.js';
import { addWishlistBodySchema } from './wishlist.schemas.js';

export const wishlistRouter = Router();

wishlistRouter.post(
  '/',
  authenticate,
  authenticateCurrentUser,
  authorize(...CANDIDATE_ROLES),
  validateBody(addWishlistBodySchema),
  wishlistController.saveJob,
);
