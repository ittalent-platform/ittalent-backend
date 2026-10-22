import { Router } from 'express';

import { authenticate, authenticateCurrentUser } from '../../middleware/auth.middleware.js';
import { uploadAvatar } from '../../middleware/avatar-upload.middleware.js';
import { validateBody } from '../../middleware/validate.js';
import { myProfileController } from './my-profile.controller.js';
import { updateMyProfileSchema } from './my-profile.schemas.js';

export const myProfileRouter = Router();
myProfileRouter.use(authenticate, authenticateCurrentUser);
myProfileRouter.get('/', myProfileController.get);
myProfileRouter.patch('/', validateBody(updateMyProfileSchema), myProfileController.update);
myProfileRouter.patch('/avatar', uploadAvatar, myProfileController.uploadAvatar);
