import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { WISHLIST_MESSAGES } from './wishlist.constants.js';
import type { AddWishlistBody } from './wishlist.schemas.js';
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
}

export const wishlistController = new WishlistController();
