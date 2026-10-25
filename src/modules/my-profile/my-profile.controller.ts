import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { PROFILE_MESSAGES } from './my-profile.constants.js';
import { myProfileService, type MyProfileService } from './my-profile.service.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

function currentUserId(id?: string): string {
  if (!id) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, PROFILE_MESSAGES.AUTH_REQUIRED);
  return id;
}

export class MyProfileController {
  constructor(
    private readonly service: MyProfileService = myProfileService,
  ) {}

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.get(currentUserId(req.user?.id));
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as UpdateMyProfile;
      const result = await this.service.update(currentUserId(req.user?.id), body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  uploadAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // uploadAvatar middleware rejects missing files before this controller runs.
      const result = await this.service.replaceAvatar(currentUserId(req.user?.id), req.file!);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const myProfileController = new MyProfileController();
