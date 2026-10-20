import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import type { HttpError } from '../../../src/shared/errors/http-error.js';
import { NOTIFICATION_MESSAGES } from '../../../src/modules/notifications/notifications.constants.js';
import type { NotificationBus } from '../../../src/modules/notifications/notifications.bus.js';
import type { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';

describe('NotificationsService (UC-S2-NOTI-01 through 04)', () => {
  let mockRepository: {
    findPage: ReturnType<typeof vi.fn>;
    countUnread: ReturnType<typeof vi.fn>;
    findByIdAndUser: ReturnType<typeof vi.fn>;
    markOneAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    softDeleteOne: ReturnType<typeof vi.fn>;
    softDeleteAll: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsertDeviceToken: ReturnType<typeof vi.fn>;
    deleteDeviceToken: ReturnType<typeof vi.fn>;
    findDeviceTokensByUser: ReturnType<typeof vi.fn>;
  };
  let mockBus: {
    emitNotification: ReturnType<typeof vi.fn>;
    subscribeUser: ReturnType<typeof vi.fn>;
  };
  let service: NotificationsService;
  const userId = new Types.ObjectId().toString();

  beforeEach(() => {
    mockRepository = {
      findPage: vi.fn(),
      countUnread: vi.fn(),
      findByIdAndUser: vi.fn(),
      markOneAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      softDeleteOne: vi.fn(),
      softDeleteAll: vi.fn(),
      create: vi.fn(),
      upsertDeviceToken: vi.fn(),
      deleteDeviceToken: vi.fn(),
      findDeviceTokensByUser: vi.fn(),
    };
    mockBus = {
      emitNotification: vi.fn(),
      subscribeUser: vi.fn(),
    };
    service = new NotificationsService(
      mockRepository as unknown as NotificationsRepository,
      mockBus as unknown as NotificationBus,
    );
  });

  describe('listMine (UC-S2-NOTI-01)', () => {
    it('returns paginated notifications with mapped DTOs and unread count', async () => {
      const mockDocId = new Types.ObjectId();
      const createdAt = new Date('2026-05-22T10:00:00.000Z');

      mockRepository.findPage.mockResolvedValue({
        items: [
          {
            _id: mockDocId,
            recipient_id: new Types.ObjectId(userId),
            title: 'Application Received',
            message: 'Your application has been received.',
            type: 'application_submitted',
            category: 'info',
            action_url: '/applications/123',
            data: { appId: '123' },
            is_read: false,
            read_at: null,
            createdAt,
          },
        ],
        total: 1,
        unreadCount: 1,
      });

      const response = await service.listMine(userId, { page: 1, limit: 10 });

      expect(mockRepository.findPage).toHaveBeenCalledWith(userId, { page: 1, limit: 10 });
      expect(response.total).toBe(1);
      expect(response.totalPages).toBe(1);
      expect(response.unreadCount).toBe(1);
      expect(response.items[0]).toEqual({
        id: mockDocId.toString(),
        title: 'Application Received',
        message: 'Your application has been received.',
        type: 'application_submitted',
        category: 'info',
        actionUrl: '/applications/123',
        data: { appId: '123' },
        isRead: false,
        readAt: null,
        createdAt: createdAt.toISOString(),
      });
    });

    it('handles empty inbox gracefully (AC.1)', async () => {
      mockRepository.findPage.mockResolvedValue({
        items: [],
        total: 0,
        unreadCount: 0,
      });

      const response = await service.listMine(userId, { page: 1, limit: 10 });

      expect(response.items).toEqual([]);
      expect(response.total).toBe(0);
      expect(response.totalPages).toBe(0);
      expect(response.unreadCount).toBe(0);
    });
  });

  describe('getUnreadCount', () => {
    it('retrieves unread badge count', async () => {
      mockRepository.countUnread.mockResolvedValue(4);

      const result = await service.getUnreadCount(userId);

      expect(mockRepository.countUnread).toHaveBeenCalledWith(userId);
      expect(result.unreadCount).toBe(4);
    });
  });

  describe('markAllAsRead (UC-S2-NOTI-02)', () => {
    it('marks all active notifications as read and resets unread count', async () => {
      mockRepository.markAllAsRead.mockResolvedValue(5);

      const response = await service.markAllAsRead(userId);

      expect(mockRepository.markAllAsRead).toHaveBeenCalledWith(userId);
      expect(response.updatedCount).toBe(5);
      expect(response.unreadCount).toBe(0);
      expect(response.message).toBe(NOTIFICATION_MESSAGES.ALL_MARKED_READ);
    });

    it('returns empty message when no notifications needed updating (AC.1)', async () => {
      mockRepository.markAllAsRead.mockResolvedValue(0);

      const response = await service.markAllAsRead(userId);

      expect(response.updatedCount).toBe(0);
      expect(response.unreadCount).toBe(0);
      expect(response.message).toBe(NOTIFICATION_MESSAGES.NO_UPDATES_NEEDED);
    });
  });

  describe('markOneAsRead', () => {
    it('marks single notification as read if found', async () => {
      const notiId = new Types.ObjectId().toString();
      const mockDoc = {
        _id: new Types.ObjectId(notiId),
        title: 'Interview alert',
        message: 'Reminder',
        type: 'interview_scheduled',
        category: 'info',
        is_read: false,
        createdAt: new Date(),
      };

      mockRepository.findByIdAndUser.mockResolvedValue(mockDoc);
      mockRepository.markOneAsRead.mockResolvedValue(true);

      const result = await service.markOneAsRead(userId, notiId);

      expect(mockRepository.findByIdAndUser).toHaveBeenCalledWith(userId, notiId);
      expect(mockRepository.markOneAsRead).toHaveBeenCalledWith(userId, notiId);
      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeDefined();
    });

    it('throws 404 when notification does not exist or belongs to another user (BR-23)', async () => {
      const notiId = new Types.ObjectId().toString();
      mockRepository.findByIdAndUser.mockResolvedValue(null);

      await expect(service.markOneAsRead(userId, notiId)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: NOTIFICATION_MESSAGES.NOT_FOUND,
      } as HttpError);
    });
  });

  describe('deleteNotification (UC-S2-NOTI-03)', () => {
    it('soft deletes notification when user owns it', async () => {
      const notiId = new Types.ObjectId().toString();
      mockRepository.findByIdAndUser.mockResolvedValue({ _id: notiId });
      mockRepository.softDeleteOne.mockResolvedValue(true);

      const response = await service.deleteNotification(userId, notiId);

      expect(mockRepository.findByIdAndUser).toHaveBeenCalledWith(userId, notiId);
      expect(mockRepository.softDeleteOne).toHaveBeenCalledWith(userId, notiId);
      expect(response.success).toBe(true);
      expect(response.message).toBe(NOTIFICATION_MESSAGES.DELETED);
    });

    it('throws 404 when trying to delete notification of another user (BR-23)', async () => {
      const notiId = new Types.ObjectId().toString();
      mockRepository.findByIdAndUser.mockResolvedValue(null);

      await expect(service.deleteNotification(userId, notiId)).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: NOTIFICATION_MESSAGES.NOT_FOUND,
      } as HttpError);
    });
  });

  describe('deleteAllNotifications (UC-S2-NOTI-04)', () => {
    it('soft deletes all active notifications for the user', async () => {
      mockRepository.softDeleteAll.mockResolvedValue(3);

      const response = await service.deleteAllNotifications(userId);

      expect(mockRepository.softDeleteAll).toHaveBeenCalledWith(userId);
      expect(response.deletedCount).toBe(3);
      expect(response.message).toBe(NOTIFICATION_MESSAGES.ALL_DELETED);
    });

    it('handles already empty inbox gracefully (AC.2)', async () => {
      mockRepository.softDeleteAll.mockResolvedValue(0);

      const response = await service.deleteAllNotifications(userId);

      expect(response.deletedCount).toBe(0);
      expect(response.message).toBe(NOTIFICATION_MESSAGES.NO_NOTIFICATIONS_TO_DELETE);
    });
  });

  describe('dispatch', () => {
    it('creates notification, emits it via notification bus, and returns formatted DTO', async () => {
      const docId = new Types.ObjectId();
      const createdAt = new Date();

      mockRepository.create.mockResolvedValue({
        _id: docId,
        recipient_id: new Types.ObjectId(userId),
        title: 'Status changed',
        message: 'Under review',
        type: 'application_status_changed',
        category: 'info',
        action_url: null,
        data: null,
        is_read: false,
        read_at: null,
        createdAt,
      });

      const result = await service.dispatch({
        recipientId: userId,
        title: 'Status changed',
        message: 'Under review',
        type: 'application_status_changed',
      });

      expect(mockRepository.create).toHaveBeenCalledWith({
        recipientId: userId,
        title: 'Status changed',
        message: 'Under review',
        type: 'application_status_changed',
      });
      expect(mockBus.emitNotification).toHaveBeenCalledWith(userId, result);
      expect(result.id).toBe(docId.toString());
      expect(result.title).toBe('Status changed');
    });
  });
});
