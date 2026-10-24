import { Router } from 'express';

import { authenticate, authenticateCurrentUser, requireVerifiedActiveUser } from '../../middleware/auth.middleware.js';
import { uploadAvatar } from '../../middleware/avatar-upload.middleware.js';
import { validateBody } from '../../middleware/validate.js';
import { myProfileController } from './my-profile.controller.js';
import { updateMyProfileSchema } from './my-profile.schemas.js';

export const myProfileRouter = Router();
myProfileRouter.use(authenticate);
myProfileRouter.get('/', authenticateCurrentUser, myProfileController.get);
myProfileRouter.patch('/', requireVerifiedActiveUser, validateBody(updateMyProfileSchema), myProfileController.update);
myProfileRouter.patch('/avatar', requireVerifiedActiveUser, uploadAvatar, myProfileController.uploadAvatar);
