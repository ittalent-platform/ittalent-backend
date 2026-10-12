import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { enterprisesService } from '../enterprises/enterprises.service.js';
import { userInvitationsService } from '../user-invitations/user-invitations.service.js';
import type { EmergencySuspensionBody, RoleUpdateBody, UpdateUserBody, UserIdParam, UserListQuery, StatusUpdateBody } from './users.schemas.js';
import { USER_LOG_TAGS, USER_MESSAGES } from './users.constants.js';
import { usersService, type UsersService } from './users.service.js';
import { createHttpError } from '../../shared/errors/http-error.js';

export class UsersController {
  constructor(
    private readonly service: UsersService = usersService,
    private readonly enterpriseNameLookup: (ids: string[]) => Promise<Map<string, string>> = (ids) => enterprisesService.getNamesByIds(ids),
    private readonly invitationStatusLookup: (ids: string[]) => ReturnType<typeof userInvitationsService.getStatuses> = (ids) => userInvitationsService.getStatuses(ids),
  ) {}

  private async storeGuard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(USER_LOG_TAGS.STORE_ERROR, error);
      throw createHttpError(HTTP_STATUS.HTTP_503_SERVICE_UNAVAILABLE, USER_MESSAGES.STORE_UNAVAILABLE);
    }
  }

  private async withAdminMetadata<T extends { id: string; enterpriseId: string | null }>(user: T): Promise<T & {
    enterpriseName: string | null;
    invitation: { status: string; deliveryStatus: string; expiresAt: string; sentAt: string | null } | null;
  }> {
    const [enterpriseNames, invitations] = await this.storeGuard(() => Promise.all([
      user.enterpriseId ? this.enterpriseNameLookup([user.enterpriseId]) : Promise.resolve(new Map<string, string>()),
      this.invitationStatusLookup([user.id]),
    ]));
    const invitation = invitations.get(user.id);
    return {
      ...user,
      enterpriseName: user.enterpriseId ? enterpriseNames.get(user.enterpriseId) ?? null : null,
      invitation: invitation ? {
        status: invitation.status,
        deliveryStatus: invitation.deliveryStatus,
        expiresAt: invitation.expiresAt,
        sentAt: invitation.sentAt,
      } : null,
    };
  }

  listUsers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = res.locals.validated?.query as UserListQuery;
      const result = await this.service.listUsers(query);
      const enterpriseIds = [...new Set(result.items.flatMap((user) => user.enterpriseId ? [user.enterpriseId] : []))];
      const [enterpriseNames, invitations] = await this.storeGuard(() => Promise.all([
        this.enterpriseNameLookup(enterpriseIds),
        this.invitationStatusLookup(result.items.map((user) => user.id)),
      ]));
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        ...result,
        items: result.items.map((user) => ({
          ...user,
          enterpriseName: user.enterpriseId ? enterpriseNames.get(user.enterpriseId) ?? null : null,
          invitation: invitations.get(user.id) ? {
            status: invitations.get(user.id)!.status,
            deliveryStatus: invitations.get(user.id)!.deliveryStatus,
            expiresAt: invitations.get(user.id)!.expiresAt,
            sentAt: invitations.get(user.id)!.sentAt,
          } : null,
        })),
      });
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
      const result = await this.withAdminMetadata(await this.service.getUserById(params.id));
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
