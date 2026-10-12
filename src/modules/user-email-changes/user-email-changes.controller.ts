import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { UserIdParam } from '../users/users.schemas.js';
import { userEmailChangesService, type UserEmailChangesService } from './user-email-changes.service.js';
import type { ConfirmUserEmailChangeBody } from './user-email-changes.schemas.js';

export class UserEmailChangesController {
  constructor(private readonly service: UserEmailChangesService = userEmailChangesService) {}

  request = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as { newEmail: string; expectedVersion: number };
      const result = await this.service.request(req.user?.id ?? '', params.id, body.newEmail, body.expectedVersion);
      res.status(HTTP_STATUS.HTTP_202_ACCEPTED).json(result);
    } catch (error) { next(error); }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as ConfirmUserEmailChangeBody;
      const result = await this.service.confirm(req.user?.id ?? '', body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };
}

export const userEmailChangesController = new UserEmailChangesController();
