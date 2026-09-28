import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import {
  loginRateLimit,
  registerRateLimit,
  resendVerificationEmailRateLimit,
} from '../../middleware/rate-limit.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';
import {
  loginRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
  resendVerificationEmailRequestSchema,
  verifyEmailQuerySchema,
} from './auth.schemas.js';

export const authRouter = Router();

authRouter.post('/register', registerRateLimit, validateBody(registerRequestSchema), authController.register);
authRouter.post('/login', loginRateLimit, validateBody(loginRequestSchema), authController.login);
authRouter.post('/refresh', validateBody(refreshTokenRequestSchema), authController.refreshToken);
authRouter.get('/me', authenticate, authController.getMe);
authRouter.get('/verify-email', validateQuery(verifyEmailQuerySchema), authController.verifyEmail);
authRouter.post(
  '/resend-verification-email',
  resendVerificationEmailRateLimit,
  validateBody(resendVerificationEmailRequestSchema),
  authController.resendVerificationEmail,
);

