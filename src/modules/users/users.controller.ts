import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type {
  CreateEmployeeBody,
  UpdateUserBody,
  UpdateUserStatusBody,
  UserIdParam,
  UserListQuery,
} from './users.schemas.js';
import { usersService, type UsersService } from './users.service.js';

export class UsersController {
  constructor(private readonly service: UsersService = usersService) {}

  /** UC 10: Create employee account */
  createEmployee = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id || !req.user.role) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      }
      const body = res.locals.validated?.body as CreateEmployeeBody;
      const actor = { id: req.user.id, role: req.user.role };
      const result = await this.service.createEmployee(actor, body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** UC 13 & UC 16: View employee list, search & filter */
  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (res.locals.validated?.query as UserListQuery) ?? req.query;
      const actor = req.user?.id && req.user?.role
        ? { id: req.user.id, role: req.user.role }
        : undefined;
      const result = await this.service.listUsers(query, actor);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** UC 11: Update employee information */
  updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id || !req.user.role) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      }
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as UpdateUserBody;
      const actor = { id: req.user.id, role: req.user.role };
      const result = await this.service.updateUser(actor, params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** UC 12: Update an employee's status (active/suspended) */
  updateUserStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.id || !req.user.role) {
        throw createHttpError(HTTP_STATUS.HTTP_401_UNAUTHORIZED, 'Authentication required');
      }
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as UpdateUserStatusBody;
      const actor = { id: req.user.id, role: req.user.role };
      const result = await this.service.updateUserStatus(actor, params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** UC 14: View an employee detail */
  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const actor = req.user?.id && req.user?.role
        ? { id: req.user.id, role: req.user.role }
        : undefined;
      const result = await this.service.getUserById(params.id, actor);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  /** UC 15: View employee history */
  getUserHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const actor = req.user?.id && req.user?.role
        ? { id: req.user.id, role: req.user.role }
        : undefined;
      const result = await this.service.getUserHistory(params.id, actor);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const usersController = new UsersController();
