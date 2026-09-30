import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { UpdateUserBody, UserIdParam, UserListQuery } from './users.schemas.js';
import { usersService, type UsersService } from './users.service.js';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = res.locals.validated?.query as UserListQuery;
      const result = await this.service.listUsers(query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as UpdateUserBody;
      const result = await this.service.updateUser(req.user?.id ?? '', params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

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
