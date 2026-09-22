import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { UserIdParam } from './users.schemas.js';
import { usersService, type UsersService } from './users.service.js';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  getUserById = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const result = await this.service.getUserById(params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const usersController = new UsersController();
