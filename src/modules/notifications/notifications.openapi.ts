import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  deleteAllNotificationsResponseSchema,
  deleteNotificationResponseSchema,
  deviceTokenParamSchema,
  markAllReadResponseSchema,
  notificationIdParamSchema,
  notificationItemSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  registerDeviceTokenBodySchema,
  unreadCountResponseSchema,
} from './notifications.schemas.js';

export function registerNotificationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredItemDto = registry.register('NotificationItemDTO', notificationItemSchema);
  const registeredListResponse = registry.register('NotificationListResponse', notificationListResponseSchema);
  const registeredUnreadCountResponse = registry.register('UnreadCountResponse', unreadCountResponseSchema);
  const registeredMarkAllResponse = registry.register('MarkAllReadResponse', markAllReadResponseSchema);
  const registeredDeleteResponse = registry.register('DeleteNotificationResponse', deleteNotificationResponseSchema);
  const registeredDeleteAllResponse = registry.register('DeleteAllNotificationsResponse', deleteAllNotificationsResponseSchema);
  const registeredRegisterDeviceRequest = registry.register('RegisterDeviceTokenRequest', registerDeviceTokenBodySchema);

  registry.registerPath({
    method: 'get',
    path: '/api/v1/notifications',
    tags: ['Notifications'],
    summary: 'View inbox notifications (UC-S2-NOTI-01)',
    description: 'Retrieves personal paginated notifications for the authenticated user, strictly scoped to recipient ownership (BR-23).',
    security: [{ bearerAuth: [] }],
    request: { query: notificationListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Inbox notifications list retrieved successfully',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid query filters or pagination parameters' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/notifications/unread-count',
    tags: ['Notifications'],
    summary: 'Get unread notification count badge',
    description: 'Returns total count of unread notifications for badge indicators.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Unread notification count',
        content: { 'application/json': { schema: registeredUnreadCountResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/notifications/read-all',
    tags: ['Notifications'],
    summary: 'Mark all notifications as read (UC-S2-NOTI-02)',
    description: 'Marks all unread notifications belonging to authenticated user as read.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'All notifications marked as read',
        content: { 'application/json': { schema: registeredMarkAllResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/notifications/{id}/read',
    tags: ['Notifications'],
    summary: 'Mark single notification as read',
    description: 'Marks a specific notification as read, enforcing BR-23 ownership.',
    security: [{ bearerAuth: [] }],
    request: { params: notificationIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Notification marked as read',
        content: { 'application/json': { schema: registeredItemDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid notification ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Notification not found or access denied' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/notifications/{id}',
    tags: ['Notifications'],
    summary: 'Delete notification (UC-S2-NOTI-03)',
    description: 'Soft-deletes a single personal notification belonging to the authenticated account.',
    security: [{ bearerAuth: [] }],
    request: { params: notificationIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Notification soft-deleted successfully',
        content: { 'application/json': { schema: registeredDeleteResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid notification ID' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Notification not found or access denied' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/notifications',
    tags: ['Notifications'],
    summary: 'Delete all notifications (UC-S2-NOTI-04)',
    description: 'Soft-deletes all notifications in the authenticated user inbox.',
    security: [{ bearerAuth: [] }],
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'All notifications soft-deleted successfully',
        content: { 'application/json': { schema: registeredDeleteAllResponse } },
      },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/notifications/devices',
    tags: ['Notifications'],
    summary: 'Register push device token',
    description: 'Registers or updates FCM device token for mobile push notifications.',
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: registeredRegisterDeviceRequest } },
      },
    },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Device token registered successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid payload' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/notifications/devices/{token}',
    tags: ['Notifications'],
    summary: 'Unregister push device token',
    description: 'Removes registered FCM device token on logout.',
    security: [{ bearerAuth: [] }],
    request: { params: deviceTokenParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_204_NO_CONTENT]: { description: 'Device token unregistered successfully' },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid token parameter' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
    },
  });
}
