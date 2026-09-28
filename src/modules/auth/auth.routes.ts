import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import {
  forgotPasswordRateLimit,
  loginRateLimit,
  registerRateLimit,
  resendVerificationEmailRateLimit,
  resetPasswordRateLimit,
  resetPasswordTokenCheckRateLimit,
} from '../../middleware/rate-limit.middleware.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { authController } from './auth.controller.js';
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
  resendVerificationEmailRequestSchema,
  resetPasswordRequestSchema,
  resetPasswordTokenQuerySchema,
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
authRouter.post(
  '/forgot-password',
  forgotPasswordRateLimit,
  validateBody(forgotPasswordRequestSchema),
  authController.forgotPassword,
);
authRouter.get(
  '/reset-password',
  resetPasswordTokenCheckRateLimit,
  validateQuery(resetPasswordTokenQuerySchema),
  authController.checkResetPasswordToken,
);
authRouter.post(
  '/reset-password',
  resetPasswordRateLimit,
  validateBody(resetPasswordRequestSchema),
  authController.resetPassword,
);
authRouter.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordRequestSchema),
  authController.changePassword,
);


