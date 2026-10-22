import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import {
  broadcastIdParamSchema,
  broadcastListQuerySchema,
  broadcastListResponseSchema,
  broadcastNotificationDtoSchema,
  createBroadcastNotificationSchema,
  scheduleBroadcastNotificationSchema,
  updateBroadcastNotificationSchema,
} from './broadcast-notifications.schemas.js';

export function registerBroadcastNotificationsOpenApi(registry: OpenAPIRegistry): void {
  const registeredDto = registry.register(
    'BroadcastNotificationDTO',
    broadcastNotificationDtoSchema,
  );
  const registeredListResponse = registry.register(
    'BroadcastListResponse',
    broadcastListResponseSchema,
  );
  const registeredCreateRequest = registry.register(
    'CreateBroadcastNotificationRequest',
    createBroadcastNotificationSchema,
  );
  const registeredUpdateRequest = registry.register(
    'UpdateBroadcastNotificationRequest',
    updateBroadcastNotificationSchema,
  );
  const registeredScheduleRequest = registry.register(
    'ScheduleBroadcastNotificationRequest',
    scheduleBroadcastNotificationSchema,
  );

  registry.registerPath({
    method: 'get',
    path: '/api/v1/broadcast-notifications',
    tags: ['Broadcast Notifications'],
    summary: 'View list, filter and search broadcast notifications (UC-02 / UC-07)',
    description: 'Retrieves paginated broadcast announcements with multi-criteria filtering by keyword, audience, priority, status, and date range.',
    security: [{ bearerAuth: [] }],
    request: { query: broadcastListQuerySchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notifications list retrieved successfully',
        content: { 'application/json': { schema: registeredListResponse } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Invalid query filters' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/broadcast-notifications',
    tags: ['Broadcast Notifications'],
    summary: 'Create a broadcast notification (UC-01)',
    description: 'Composes a new broadcast notification. When is_draft is false, dispatches the notification to targeted audiences immediately.',
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema: registeredCreateRequest } } } },
    responses: {
      [HTTP_STATUS.HTTP_201_CREATED]: {
        description: 'Broadcast notification created successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation error' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/api/v1/broadcast-notifications/{id}',
    tags: ['Broadcast Notifications'],
    summary: 'View broadcast notification detail (UC-03)',
    description: 'Inspects complete details of a broadcast notification including live delivery reach and read metrics.',
    security: [{ bearerAuth: [] }],
    request: { params: broadcastIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notification detail retrieved successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/api/v1/broadcast-notifications/{id}',
    tags: ['Broadcast Notifications'],
    summary: 'Update broadcast notification information (UC-05)',
    description: 'Modifies text, category, audience, priority, or action link of an un-dispatched (Draft or Scheduled) broadcast.',
    security: [{ bearerAuth: [] }],
    request: {
      params: broadcastIdParamSchema,
      body: { content: { 'application/json': { schema: registeredUpdateRequest } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notification updated successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Validation error or sent record cannot be modified' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/broadcast-notifications/{id}/schedule',
    tags: ['Broadcast Notifications'],
    summary: 'Schedule broadcast notification (UC-04)',
    description: 'Schedules a broadcast notification for automatic dispatch at a designated future date and time (minimum 15 minutes ahead).',
    security: [{ bearerAuth: [] }],
    request: {
      params: broadcastIdParamSchema,
      body: { content: { 'application/json': { schema: registeredScheduleRequest } } },
    },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notification scheduled successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Scheduled time must be at least 15 minutes in future or already sent' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/broadcast-notifications/{id}/cancel-schedule',
    tags: ['Broadcast Notifications'],
    summary: 'Cancel scheduled broadcast dispatch',
    description: 'Cancels scheduled execution and reverts broadcast status to Draft.',
    security: [{ bearerAuth: [] }],
    request: { params: broadcastIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Scheduled dispatch cancelled successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Broadcast is not in scheduled state' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/v1/broadcast-notifications/{id}/dispatch',
    tags: ['Broadcast Notifications'],
    summary: 'Dispatch broadcast notification immediately',
    description: 'Triggers immediate dispatch of a draft or scheduled broadcast announcement.',
    security: [{ bearerAuth: [] }],
    request: { params: broadcastIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notification dispatched successfully',
        content: { 'application/json': { schema: registeredDto } },
      },
      [HTTP_STATUS.HTTP_400_BAD_REQUEST]: { description: 'Broadcast already sent' },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/api/v1/broadcast-notifications/{id}',
    tags: ['Broadcast Notifications'],
    summary: 'Delete a broadcast notification (UC-06)',
    description: 'Removes a draft/scheduled broadcast or archives a sent broadcast from active directory.',
    security: [{ bearerAuth: [] }],
    request: { params: broadcastIdParamSchema },
    responses: {
      [HTTP_STATUS.HTTP_200_OK]: {
        description: 'Broadcast notification deleted successfully',
      },
      [HTTP_STATUS.HTTP_404_NOT_FOUND]: { description: 'Broadcast notification not found' },
      [HTTP_STATUS.HTTP_401_UNAUTHORIZED]: { description: 'Authentication required' },
      [HTTP_STATUS.HTTP_403_FORBIDDEN]: { description: 'Administrator privileges required' },
    },
  });
}
