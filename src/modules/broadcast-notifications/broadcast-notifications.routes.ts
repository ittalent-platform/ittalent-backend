import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { broadcastNotificationsController } from './broadcast-notifications.controller.js';
import {
  broadcastIdParamSchema,
  broadcastListQuerySchema,
  createBroadcastNotificationSchema,
  scheduleBroadcastNotificationSchema,
  updateBroadcastNotificationSchema,
} from './broadcast-notifications.schemas.js';

export const broadcastNotificationsRouter = Router();

broadcastNotificationsRouter.use(authenticate, authorize('admin'));

// UC-02 & UC-07: List, Search, and Filter Broadcast Notifications
broadcastNotificationsRouter.get(
  '/',
  validateQuery(broadcastListQuerySchema),
  broadcastNotificationsController.list,
);

// UC-01: Create Broadcast Notification
broadcastNotificationsRouter.post(
  '/',
  validateBody(createBroadcastNotificationSchema),
  broadcastNotificationsController.create,
);

// UC-03: View Broadcast Notification Detail
broadcastNotificationsRouter.get(
  '/:id',
  validateParams(broadcastIdParamSchema),
  broadcastNotificationsController.getById,
);

// UC-05: Update Broadcast Notification Information
broadcastNotificationsRouter.patch(
  '/:id',
  validateParams(broadcastIdParamSchema),
  validateBody(updateBroadcastNotificationSchema),
  broadcastNotificationsController.update,
);

// UC-04: Schedule Broadcast Notification
broadcastNotificationsRouter.post(
  '/:id/schedule',
  validateParams(broadcastIdParamSchema),
  validateBody(scheduleBroadcastNotificationSchema),
  broadcastNotificationsController.schedule,
);

// Cancel Schedule (Revert to Draft)
broadcastNotificationsRouter.post(
  '/:id/cancel-schedule',
  validateParams(broadcastIdParamSchema),
  broadcastNotificationsController.cancelSchedule,
);

// Dispatch Now (Immediate Dispatch)
broadcastNotificationsRouter.post(
  '/:id/dispatch',
  validateParams(broadcastIdParamSchema),
  broadcastNotificationsController.dispatchNow,
);

// UC-06: Delete Broadcast Notification
broadcastNotificationsRouter.delete(
  '/:id',
  validateParams(broadcastIdParamSchema),
  broadcastNotificationsController.delete,
);
