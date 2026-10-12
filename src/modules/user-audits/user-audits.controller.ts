import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { UserIdParam } from '../users/users.schemas.js';
import { usersService, type UsersService } from '../users/users.service.js';
import { userAuditsService, type UserAuditsService } from './user-audits.service.js';
import type { UserAuditHistoryQuery } from './user-audits.schemas.js';

export class UserAuditsController {
  constructor(
    private readonly audits: UserAuditsService = userAuditsService,
    private readonly users: UsersService = usersService,
  ) {}

  listUserHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = (res.locals.validated?.params as UserIdParam).id;
      const query = res.locals.validated?.query as UserAuditHistoryQuery;
      await this.users.getUserById(id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(await this.audits.list(id, query));
    } catch (error) { next(error); }
  };
}

export const userAuditsController = new UserAuditsController();
