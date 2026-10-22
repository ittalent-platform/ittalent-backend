import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  broadcastNotificationsService,
  type BroadcastNotificationsService,
} from './broadcast-notifications.service.js';
import type {
  BroadcastListQuery,
  CreateBroadcastNotificationInput,
  ScheduleBroadcastNotificationInput,
  UpdateBroadcastNotificationInput,
} from './broadcast-notifications.schemas.js';

export class BroadcastNotificationsController {
  constructor(
    private readonly service: BroadcastNotificationsService = broadcastNotificationsService,
  ) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const input = (res.locals.validated?.body ?? req.body) as CreateBroadcastNotificationInput;
      const result = await this.service.create(actor, input);
      res.status(HTTP_STATUS.HTTP_201_CREATED).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (res.locals.validated?.query ?? req.query) as BroadcastListQuery;
      const result = await this.service.list(query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const result = await this.service.getById(id);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const id = req.params.id as string;
      const input = (res.locals.validated?.body ?? req.body) as UpdateBroadcastNotificationInput;
      const result = await this.service.update(actor, id, input);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const id = req.params.id as string;
      const input = (res.locals.validated?.body ?? req.body) as ScheduleBroadcastNotificationInput;
      const result = await this.service.schedule(actor, id, input);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  cancelSchedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const id = req.params.id as string;
      const result = await this.service.cancelSchedule(actor, id);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  dispatchNow = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const id = req.params.id as string;
      const result = await this.service.dispatchNow(actor, id);
      res.status(HTTP_STATUS.HTTP_200_OK).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        sub: req.user!.id,
        email: req.user!.email,
        role: req.user!.role,
      };
      const id = req.params.id as string;
      const result = await this.service.delete(actor, id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const broadcastNotificationsController = new BroadcastNotificationsController();
