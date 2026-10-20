import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { NOTIFICATION_MESSAGES } from './notifications.constants.js';
import {
  notificationsRepository,
  type NotificationsRepository,
} from './notifications.repository.js';
import type {
  CreateNotificationInput,
  DeleteAllNotificationsResponse,
  DeleteNotificationResponse,
  MarkAllReadResponse,
  NotificationItemDto,
  NotificationListQuery,
  NotificationListResponse,
  RegisterDeviceTokenBody,
  UnreadCountResponse,
} from './notifications.schemas.js';

export class NotificationsService {
  constructor(private readonly repository: NotificationsRepository = notificationsRepository) {}

  async listMine(userId: string, query: NotificationListQuery): Promise<NotificationListResponse> {
    const { items, total, unreadCount } = await this.repository.findPage(userId, query);

    const mappedItems: NotificationItemDto[] = items.map((item) => ({
      id: item._id.toString(),
      title: item.title,
      message: item.message,
      type: item.type,
      category: item.category,
      actionUrl: item.action_url ?? null,
      data: (item.data as Record<string, unknown> | null) ?? null,
      isRead: item.is_read,
      readAt: item.read_at ? new Date(item.read_at).toISOString() : null,
      createdAt: new Date(item.createdAt).toISOString(),
    }));

    const totalPages = total > 0 ? Math.ceil(total / query.limit) : 0;

    return {
      items: mappedItems,
      unreadCount,
      page: query.page,
      limit: query.limit,
      total,
      totalPages,
    };
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResponse> {
    const unreadCount = await this.repository.countUnread(userId);
    return { unreadCount };
  }

  async markAllAsRead(userId: string): Promise<MarkAllReadResponse> {
    const updatedCount = await this.repository.markAllAsRead(userId);
    return {
      updatedCount,
      unreadCount: 0,
      message:
        updatedCount > 0
          ? NOTIFICATION_MESSAGES.ALL_MARKED_READ
          : NOTIFICATION_MESSAGES.NO_UPDATES_NEEDED,
    };
  }

  async markOneAsRead(userId: string, notificationId: string): Promise<NotificationItemDto> {
    const existing = await this.repository.findByIdAndUser(userId, notificationId);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, NOTIFICATION_MESSAGES.NOT_FOUND);
    }

    if (!existing.is_read) {
      await this.repository.markOneAsRead(userId, notificationId);
    }

    return {
      id: existing._id.toString(),
      title: existing.title,
      message: existing.message,
      type: existing.type,
      category: existing.category,
      actionUrl: existing.action_url ?? null,
      data: (existing.data as Record<string, unknown> | null) ?? null,
      isRead: true,
      readAt: new Date().toISOString(),
      createdAt: new Date(existing.createdAt).toISOString(),
    };
  }

  async deleteNotification(
    userId: string,
    notificationId: string,
  ): Promise<DeleteNotificationResponse> {
    const existing = await this.repository.findByIdAndUser(userId, notificationId);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, NOTIFICATION_MESSAGES.NOT_FOUND);
    }

    await this.repository.softDeleteOne(userId, notificationId);

    return {
      success: true,
      message: NOTIFICATION_MESSAGES.DELETED,
    };
  }

  async deleteAllNotifications(userId: string): Promise<DeleteAllNotificationsResponse> {
    const deletedCount = await this.repository.softDeleteAll(userId);
    return {
      deletedCount,
      message:
        deletedCount > 0
          ? NOTIFICATION_MESSAGES.ALL_DELETED
          : NOTIFICATION_MESSAGES.NO_NOTIFICATIONS_TO_DELETE,
    };
  }

  async dispatch(input: CreateNotificationInput): Promise<NotificationItemDto> {
    const created = await this.repository.create(input);
    return {
      id: created._id.toString(),
      title: created.title,
      message: created.message,
      type: created.type,
      category: created.category,
      actionUrl: created.action_url ?? null,
      data: (created.data as Record<string, unknown> | null) ?? null,
      isRead: created.is_read,
      readAt: created.read_at ? new Date(created.read_at).toISOString() : null,
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  async registerDeviceToken(userId: string, body: RegisterDeviceTokenBody): Promise<void> {
    await this.repository.upsertDeviceToken(userId, body.token, body.platform);
  }

  async unregisterDeviceToken(userId: string, token: string): Promise<boolean> {
    return this.repository.deleteDeviceToken(userId, token);
  }
}

export const notificationsService = new NotificationsService();
