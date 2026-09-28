import type { RequestHandler } from 'express';

import { env } from '../../config/env.js';
import { consumeVerificationAttemptRateLimit } from '../../middleware/rate-limit.middleware.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { authService, type AuthService } from './auth.service.js';
import type {
  LoginRequest,
  RefreshTokenRequest,
  RegisterRequest,
  ResendVerificationEmailRequest,
  VerifyEmailQuery,
} from './auth.schemas.js';

export function getEmailVerificationRedirectUrl(
  queryString: string,
  config?: { appBaseUrl?: string; corsOrigin?: string; webUrl?: string },
): string {
  const frontendOrigin = (config?.appBaseUrl ?? config?.webUrl ?? env.APP_BASE_URL ?? 'http://localhost:5173').replace(
    /\/$/,
    '',
  );
  const suffix = queryString ? `?${queryString}` : '';
  return `${frontendOrigin}/verify-email${suffix}`;
}

export class AuthController {
  constructor(private readonly service: AuthService = authService) {}

  register: RequestHandler = async (_req, res, next) => {
    try {
      const input = res.locals.validated?.body as RegisterRequest;
      const result = await this.service.register(input);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  login: RequestHandler = async (_req, res, next) => {
    try {
      const input = res.locals.validated?.body as LoginRequest;
      const result = await this.service.login(input);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  refreshToken: RequestHandler = async (_req, res, next) => {
    try {
      const input = res.locals.validated?.body as RefreshTokenRequest;
      const result = await this.service.refreshTokens(input.refreshToken);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getMe: RequestHandler = async (req, res, next) => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      }

      const user = await this.service.getCurrentUser(req.user.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(user);
    } catch (error) {
      next(error);
    }
  };

  verifyEmail: RequestHandler = async (req, res, next) => {
    try {
      const token =
        (res.locals.validated?.query as VerifyEmailQuery | undefined)?.token ??
        (typeof req.query.token === 'string' ? req.query.token : '');

      const result = await this.service.verifyEmail(token);
      let stage = result.stage;
      let code = result.code;

      if (stage === 'invalid' || stage === 'expired') {
        const attempt = await consumeVerificationAttemptRateLimit(req);
        if (!attempt.allowed) {
          stage = 'retry-later';
          code = 'RATE_LIMITED';
        }
      }

      const params = new URLSearchParams({ stage });
      if (code) {
        params.set('code', code);
      }

      const redirectUrl = getEmailVerificationRedirectUrl(params.toString());
      res.redirect(HTTP_STATUS.HTTP_302_FOUND, redirectUrl);
    } catch (error) {
      next(error);
    }
  };

  resendVerificationEmail: RequestHandler = async (_req, res, next) => {
    try {
      const input = res.locals.validated?.body as ResendVerificationEmailRequest;
      const result = await this.service.resendVerificationEmail(input);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const authController = new AuthController();

