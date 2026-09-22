import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { authService, type AuthService } from './auth.service.js';
import type { LoginRequest, RefreshTokenRequest, RegisterRequest } from './auth.schemas.js';

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
}

export const authController = new AuthController();
