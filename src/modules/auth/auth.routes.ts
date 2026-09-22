import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import { loginRateLimit, registerRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';
import {
  loginRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', registerRateLimit, validateBody(registerRequestSchema), authController.register);
authRouter.post('/login', loginRateLimit, validateBody(loginRequestSchema), authController.login);
authRouter.post('/refresh', validateBody(refreshTokenRequestSchema), authController.refreshToken);
authRouter.get('/me', authenticate, authController.getMe);
