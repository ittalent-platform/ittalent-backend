import { z } from 'zod';

import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import { paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';
import {
  devicePlatforms,
  notificationCategories,
  notificationTypes,
} from './notifications.constants.js';

export const notificationIdParamSchema = z.strictObject({
  id: objectIdSchema('notification ID'),
});

export const notificationListQuerySchema = z.strictObject({
  ...paginationQueryShape,
  isRead: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().optional()),
  type: z.enum(notificationTypes).optional(),
  category: z.enum(notificationCategories).optional(),
});

export const notificationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string(),
  type: z.enum(notificationTypes),
  category: z.enum(notificationCategories),
  actionUrl: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  isRead: z.boolean(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const notificationListResponseSchema = z.object({
  items: z.array(notificationItemSchema),
  unreadCount: z.number().int().min(0),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int().min(0),
});

export const markAllReadResponseSchema = z.object({
  updatedCount: z.number().int().min(0),
  unreadCount: z.literal(0),
  message: z.string(),
});

export const deleteNotificationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const deleteAllNotificationsResponseSchema = z.object({
  deletedCount: z.number().int().min(0),
  message: z.string(),
});

export const registerDeviceTokenBodySchema = z.strictObject({
  token: z.string().min(1).max(500),
  platform: z.enum(devicePlatforms),
});

export const deviceTokenParamSchema = z.strictObject({
  token: z.string().min(1).max(500),
});

export const createNotificationInputSchema = z.object({
  recipientId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid recipient ID format'),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  type: z.enum(notificationTypes),
  category: z.enum(notificationCategories).optional().default('info'),
  actionUrl: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type NotificationItemDto = z.infer<typeof notificationItemSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
export type MarkAllReadResponse = z.infer<typeof markAllReadResponseSchema>;
export type DeleteNotificationResponse = z.infer<typeof deleteNotificationResponseSchema>;
export type DeleteAllNotificationsResponse = z.infer<typeof deleteAllNotificationsResponseSchema>;
export type RegisterDeviceTokenBody = z.infer<typeof registerDeviceTokenBodySchema>;
export type CreateNotificationInput = z.input<typeof createNotificationInputSchema>;
