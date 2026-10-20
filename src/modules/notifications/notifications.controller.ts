import type { NextFunction, Request, Response } from 'express';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  notificationsService,
  type NotificationsService,
} from './notifications.service.js';
import type {
  DeviceTokenParam,
  NotificationIdParam,
  NotificationListQuery,
  RegisterDeviceTokenBody,
} from './notifications.schemas.js';

export class NotificationsController {
  constructor(private readonly service: NotificationsService = notificationsService) {}

  listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (res.locals.validated?.query ?? req.query) as NotificationListQuery;
      const result = await this.service.listMine(req.user!.id, query);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  getUnreadCount = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.getUnreadCount(req.user!.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  markAllAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.markAllAsRead(req.user!.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  markOneAsRead = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = (res.locals.validated?.params ?? req.params) as NotificationIdParam;
      const result = await this.service.markOneAsRead(req.user!.id, params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteNotification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = (res.locals.validated?.params ?? req.params) as NotificationIdParam;
      const result = await this.service.deleteNotification(req.user!.id, params.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteAllNotifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.deleteAllNotifications(req.user!.id);
      res.status(HTTP_STATUS.HTTP_200_OK).json(result);
    } catch (error) {
      next(error);
    }
  };

  registerDeviceToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = (res.locals.validated?.body ?? req.body) as RegisterDeviceTokenBody;
      await this.service.registerDeviceToken(req.user!.id, body);
      res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  };

  unregisterDeviceToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const params = (res.locals.validated?.params ?? req.params) as DeviceTokenParam;
      await this.service.unregisterDeviceToken(req.user!.id, params.token);
      res.status(HTTP_STATUS.HTTP_204_NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  };
}

export const notificationsController = new NotificationsController();
