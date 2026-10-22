import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { WISHLIST_MESSAGES } from './wishlist.constants.js';
import type { AddWishlistBody, WishlistJobParam, WishlistQuery } from './wishlist.schemas.js';
import { wishlistService, type WishlistService } from './wishlist.service.js';

export class WishlistController {
  constructor(private readonly service: WishlistService = wishlistService) {}

  saveJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, WISHLIST_MESSAGES.AUTH_REQUIRED);
      }
      const body = res.locals.validated?.body as AddWishlistBody;
      const result = await this.service.saveJob(req.user.id, body.jobId);
      const statusCode = result.alreadySaved ? HTTP_STATUS.HTTP_200_OK : HTTP_STATUS.HTTP_201_CREATED;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  };

  toggleJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, WISHLIST_MESSAGES.AUTH_REQUIRED);
      }
      const jobId =
        (res.locals.validated?.params as WishlistJobParam | undefined)?.jobId ??
        (res.locals.validated?.body as AddWishlistBody | undefined)?.jobId;

      if (!jobId) {
        throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Job ID is required');
      }

      const result = await this.service.toggleSave(req.user.id, jobId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, WISHLIST_MESSAGES.AUTH_REQUIRED);
      }
      const query = res.locals.validated?.query as WishlistQuery;
      const result = await this.service.listMine(req.user.id, query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  checkSaved = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, WISHLIST_MESSAGES.AUTH_REQUIRED);
      }
      const params = res.locals.validated?.params as WishlistJobParam;
      const result = await this.service.checkSaved(req.user.id, params.jobId);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const wishlistController = new WishlistController();
