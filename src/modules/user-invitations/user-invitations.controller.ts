import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { CreateAdminUserBody, UserIdParam } from '../users/users.schemas.js';
import { userInvitationsService, type UserInvitationsService } from './user-invitations.service.js';
import type { AcceptExistingAccountInvitationBody, AcceptNewAccountInvitationBody } from './user-invitations.schemas.js';

export class UserInvitationsController {
  constructor(private readonly service: UserInvitationsService = userInvitationsService) {}

  createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as CreateAdminUserBody;
      const result = await this.service.createAccount(req.user?.id ?? '', body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
    } catch (error) { next(error); }
  };

  inviteExisting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as { enterpriseId: string };
      const result = await this.service.inviteExistingUser(req.user?.id ?? '', params.id, body.enterpriseId);
      res.status(HTTP_STATUS.HTTP_202_ACCEPTED).json(result);
    } catch (error) { next(error); }
  };

  resend = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const result = await this.service.resendInvitation(req.user?.id ?? '', params.id);
      res.status(HTTP_STATUS.HTTP_202_ACCEPTED).json(result);
    } catch (error) { next(error); }
  };

  acceptNew = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as AcceptNewAccountInvitationBody;
      const result = await this.service.acceptNewAccount(body);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

  acceptExisting = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as AcceptExistingAccountInvitationBody;
      const result = await this.service.acceptExistingUser(req.user?.id ?? '', body.token);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };
}

export const userInvitationsController = new UserInvitationsController();
