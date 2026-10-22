import type { RequestHandler } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { myProfileService } from './my-profile.service.js';
import type { UpdateMyProfile } from './my-profile.schemas.js';

function currentUserId(id?: string): string {
  if (!id) throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
  return id;
}

export const myProfileController: { get: RequestHandler; update: RequestHandler; uploadAvatar: RequestHandler } = {
  get: async (req, res, next) => {
    try { res.json(await myProfileService.get(currentUserId(req.user?.id))); } catch (error) { next(error); }
  },
  update: async (req, res, next) => {
    try { res.json(await myProfileService.update(currentUserId(req.user?.id), res.locals.validated?.body as UpdateMyProfile)); } catch (error) { next(error); }
  },
  uploadAvatar: async (req, res, next) => {
    try {
      if (!req.file) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Avatar file is required');
      res.json(await myProfileService.replaceAvatar(currentUserId(req.user?.id), req.file));
    } catch (error) { next(error); }
  },
};
