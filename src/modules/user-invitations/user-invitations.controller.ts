import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import type { CreateAdminUserBody, UserIdParam } from '../users/users.schemas.js';
import { userInvitationsService, type UserInvitationsService } from './user-invitations.service.js';
import type { AcceptNewAccountInvitationBody, InvitationPreviewQuery } from './user-invitations.schemas.js';

export class UserInvitationsController {
  constructor(private readonly service: UserInvitationsService = userInvitationsService) {}

  createAccount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = res.locals.validated?.body as CreateAdminUserBody;
      const result = await this.service.createAccount(req.user?.id ?? '', body);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json(result);
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

  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = res.locals.validated?.query as InvitationPreviewQuery;
      const result = await this.service.preview(query.token);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

  status = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const result = await this.service.getStatus(req.user?.id ?? '', params.id);
      if (!result) {
        res.status(HTTP_STATUS.HTTP_200_OK).json(null);
        return;
      }
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) { next(error); }
  };

  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = res.locals.validated?.params as UserIdParam;
      const body = res.locals.validated?.body as { reason: string; expectedVersion: number };
      await this.service.cancel(req.user?.id ?? '', params.id, body);
      res.status(HTTP_STATUS.HTTP_200_OK).json({ success: true });
    } catch (error) { next(error); }
  };
}

export const userInvitationsController = new UserInvitationsController();
