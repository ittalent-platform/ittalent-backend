import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { EmergencySuspensionBody, RoleUpdateBody, UpdateUserBody, UserIdParam, UserListQuery, StatusUpdateBody } from './users.schemas.js';
import { usersService, type UsersService } from './users.service.js';

export class UsersController {
  constructor(
    private readonly service: UsersService = usersService,
  ) {}

  listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = res.locals.validated?.query as UserListQuery;
      res.status(HTTP_STATUS.HTTP_200_OK).json(await this.service.listUsersWithAdminMetadata(query));
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
      const result = await this.service.withAdminMetadata(await this.service.getUserById(params.id));
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as StatusUpdateBody;
      const result = await this.service.updateStatus(req.user?.id ?? '', params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

  emergencySuspend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as EmergencySuspensionBody;
      const result = await this.service.emergencySuspend(req.user?.id ?? '', params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

  updateRole = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as RoleUpdateBody;
      const result = await this.service.updateRole(req.user?.id ?? '', params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

}

export const usersController = new UsersController();
