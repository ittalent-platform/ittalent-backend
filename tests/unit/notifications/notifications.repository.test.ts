import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeviceToken } from '../../../src/models/device-token.model.js';
import { Notification } from '../../../src/models/notification.model.js';
import { NotificationsRepository } from '../../../src/modules/notifications/notifications.repository.js';

describe('NotificationsRepository (BR-23 Scoping & Soft Delete)', () => {
  const repo = new NotificationsRepository();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findPage', () => {
    it('scopes query to recipient_id and deleted_at: null with pagination', async () => {
      const userId = new Types.ObjectId().toString();
      const mockItems = [{ title: 'Note 1' }];

      const sortMock = vi.fn().mockReturnThis();
      const skipMock = vi.fn().mockReturnThis();
      const limitMock = vi.fn().mockReturnThis();
      const leanMock = vi.fn().mockReturnThis();
      const execFindMock = vi.fn().mockResolvedValue(mockItems);

      vi.spyOn(Notification, 'find').mockReturnValue({
        sort: sortMock,
        skip: skipMock,
        limit: limitMock,
        lean: leanMock,
        exec: execFindMock,
      } as any);

      let countCall = 0;
      vi.spyOn(Notification, 'countDocuments').mockImplementation(() => {
        countCall += 1;
        return {
          exec: vi.fn().mockResolvedValue(countCall === 1 ? 10 : 2),
        } as any;
      });

      const result = await repo.findPage(userId, { page: 2, limit: 10, isRead: false });

      expect(Notification.find).toHaveBeenCalledWith({
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
        is_read: false,
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skipMock).toHaveBeenCalledWith(10);
      expect(limitMock).toHaveBeenCalledWith(10);
      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(10);
      expect(result.unreadCount).toBe(2);
    });
  });

  describe('countUnread', () => {
    it('counts active unread notifications for recipient', async () => {
      const userId = new Types.ObjectId().toString();
      vi.spyOn(Notification, 'countDocuments').mockReturnValue({
        exec: vi.fn().mockResolvedValue(5),
      } as any);

      const count = await repo.countUnread(userId);

      expect(Notification.countDocuments).toHaveBeenCalledWith({
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
        is_read: false,
      });
      expect(count).toBe(5);
    });
  });

  describe('findByIdAndUser', () => {
    it('finds active notification by id and owner', async () => {
      const userId = new Types.ObjectId().toString();
      const notificationId = new Types.ObjectId().toString();
      const mockDoc = { _id: notificationId, title: 'Test' };

      vi.spyOn(Notification, 'findOne').mockReturnValue({
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(mockDoc),
      } as any);

      const result = await repo.findByIdAndUser(userId, notificationId);

      expect(Notification.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(notificationId),
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      });
      expect(result).toEqual(mockDoc);
    });
  });

  describe('markOneAsRead', () => {
    it('updates read status scoped to owner and active status', async () => {
      const userId = new Types.ObjectId().toString();
      const notificationId = new Types.ObjectId().toString();

      vi.spyOn(Notification, 'updateOne').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as any);

      const success = await repo.markOneAsRead(userId, notificationId);

      expect(Notification.updateOne).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(notificationId),
          recipient_id: new Types.ObjectId(userId),
          deleted_at: null,
        },
        {
          $set: {
            is_read: true,
            read_at: expect.any(Date),
          },
        },
      );
      expect(success).toBe(true);
    });
  });

  describe('markAllAsRead', () => {
    it('updates all active unread notifications for owner', async () => {
      const userId = new Types.ObjectId().toString();

      vi.spyOn(Notification, 'updateMany').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 4 }),
      } as any);

      const count = await repo.markAllAsRead(userId);

      expect(Notification.updateMany).toHaveBeenCalledWith(
        {
          recipient_id: new Types.ObjectId(userId),
          deleted_at: null,
          is_read: false,
        },
        {
          $set: {
            is_read: true,
            read_at: expect.any(Date),
          },
        },
      );
      expect(count).toBe(4);
    });
  });

  describe('softDeleteOne', () => {
    it('sets deleted_at for target notification owned by user', async () => {
      const userId = new Types.ObjectId().toString();
      const notificationId = new Types.ObjectId().toString();

      vi.spyOn(Notification, 'updateOne').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as any);

      const success = await repo.softDeleteOne(userId, notificationId);

      expect(Notification.updateOne).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(notificationId),
          recipient_id: new Types.ObjectId(userId),
          deleted_at: null,
        },
        {
          $set: {
            deleted_at: expect.any(Date),
          },
        },
      );
      expect(success).toBe(true);
    });
  });

  describe('softDeleteAll', () => {
    it('sets deleted_at for all active notifications owned by user', async () => {
      const userId = new Types.ObjectId().toString();

      vi.spyOn(Notification, 'updateMany').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 8 }),
      } as any);

      const count = await repo.softDeleteAll(userId);

      expect(Notification.updateMany).toHaveBeenCalledWith(
        {
          recipient_id: new Types.ObjectId(userId),
          deleted_at: null,
        },
        {
          $set: {
            deleted_at: expect.any(Date),
          },
        },
      );
      expect(count).toBe(8);
    });
  });

  describe('device token operations', () => {
    it('upserts device token', async () => {
      const userId = new Types.ObjectId().toString();
      vi.spyOn(DeviceToken, 'updateOne').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      } as any);

      await repo.upsertDeviceToken(userId, 'fcm-token-123', 'android');

      expect(DeviceToken.updateOne).toHaveBeenCalledWith(
        { token: 'fcm-token-123' },
        {
          $set: {
            user_id: new Types.ObjectId(userId),
            platform: 'android',
            last_seen_at: expect.any(Date),
          },
        },
        { upsert: true },
      );
    });

    it('deletes device token', async () => {
      const userId = new Types.ObjectId().toString();
      vi.spyOn(DeviceToken, 'deleteOne').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      } as any);

      const deleted = await repo.deleteDeviceToken(userId, 'fcm-token-123');
      expect(deleted).toBe(true);
    });
  });
});
