import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { notificationsController } from './notifications.controller.js';
import {
  deviceTokenParamSchema,
  markAllReadQuerySchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationStreamQuerySchema,
  registerDeviceTokenBodySchema,
} from './notifications.schemas.js';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get('/', validateQuery(notificationListQuerySchema), notificationsController.listMine);
notificationsRouter.get('/stream', validateQuery(notificationStreamQuerySchema), notificationsController.streamNotifications);
notificationsRouter.get('/unread-count', notificationsController.getUnreadCount);
notificationsRouter.patch('/read-all', validateQuery(markAllReadQuerySchema), notificationsController.markAllAsRead);
notificationsRouter.patch('/:id/read', validateParams(notificationIdParamSchema), notificationsController.markOneAsRead);
notificationsRouter.delete('/:id', validateParams(notificationIdParamSchema), notificationsController.deleteNotification);
notificationsRouter.delete('/', notificationsController.deleteAllNotifications);
notificationsRouter.post('/devices', validateBody(registerDeviceTokenBodySchema), notificationsController.registerDeviceToken);
notificationsRouter.delete('/devices/:token', validateParams(deviceTokenParamSchema), notificationsController.unregisterDeviceToken);
