import { Types, type ClientSession, type QueryFilter } from 'mongoose';

import { DeviceToken, type DevicePlatform } from '../../models/device-token.model.js';
import {
  Notification,
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from '../../models/notification.model.js';
import type { CreateNotificationInput, NotificationListQuery } from './notifications.schemas.js';

export class NotificationsRepository {
  async create(data: CreateNotificationInput, session?: ClientSession): Promise<NotificationData & { _id: Types.ObjectId }> {
    const [created] = await Notification.create(
      [
        {
          recipient_id: new Types.ObjectId(data.recipientId),
          title: data.title,
          message: data.message,
          type: data.type,
          category: data.category ?? 'info',
          action_url: data.actionUrl ?? null,
          data: data.data ?? null,
          is_read: false,
          read_at: null,
          deleted_at: null,
        },
      ],
      session ? { session } : undefined,
    );
    if (!created) {
      throw new Error('Failed to create notification document');
    }
    return created.toObject();
  }

  async findPage(
    userId: string,
    query: NotificationListQuery,
  ): Promise<{ items: (NotificationData & { _id: Types.ObjectId; createdAt: Date })[]; total: number; unreadCount: number }> {
    const recipient = new Types.ObjectId(userId);
    const filter: QueryFilter<NotificationData> = {
      recipient_id: recipient,
      deleted_at: null,
    };

    if (query.isRead !== undefined) {
      filter.is_read = query.isRead;
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.category) {
      filter.category = query.category;
    }

    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean()
        .exec(),
      Notification.countDocuments(filter).exec(),
      Notification.countDocuments({ recipient_id: recipient, deleted_at: null, is_read: false }).exec(),
    ]);

    return {
      items: items as unknown as (NotificationData & { _id: Types.ObjectId; createdAt: Date })[],
      total,
      unreadCount,
    };
  }

  async countUnread(userId: string): Promise<number> {
    return Notification.countDocuments({
      recipient_id: new Types.ObjectId(userId),
      deleted_at: null,
      is_read: false,
    }).exec();
  }

  async findByIdAndUser(userId: string, notificationId: string): Promise<(NotificationData & { _id: Types.ObjectId; createdAt: Date }) | null> {
    return Notification.findOne({
      _id: new Types.ObjectId(notificationId),
      recipient_id: new Types.ObjectId(userId),
      deleted_at: null,
    })
      .lean()
      .exec() as unknown as Promise<(NotificationData & { _id: Types.ObjectId; createdAt: Date }) | null>;
  }

  async markOneAsRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await Notification.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
        },
      },
    ).exec();
    return result.modifiedCount > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      {
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
        is_read: false,
      },
      {
        $set: {
          is_read: true,
          read_at: new Date(),
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  async softDeleteOne(userId: string, notificationId: string): Promise<boolean> {
    const result = await Notification.updateOne(
      {
        _id: new Types.ObjectId(notificationId),
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      },
      {
        $set: {
          deleted_at: new Date(),
        },
      },
    ).exec();
    return result.modifiedCount > 0;
  }

  async softDeleteAll(userId: string): Promise<number> {
    const result = await Notification.updateMany(
      {
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      },
      {
        $set: {
          deleted_at: new Date(),
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  async upsertDeviceToken(userId: string, token: string, platform: DevicePlatform): Promise<void> {
    await DeviceToken.updateOne(
      { token },
      {
        $set: {
          user_id: new Types.ObjectId(userId),
          platform,
          last_seen_at: new Date(),
        },
      },
      { upsert: true },
    ).exec();
  }

  async deleteDeviceToken(userId: string, token: string): Promise<boolean> {
    const result = await DeviceToken.deleteOne({
      token,
      user_id: new Types.ObjectId(userId),
    }).exec();
    return result.deletedCount > 0;
  }

  async findDeviceTokensByUser(userId: string): Promise<string[]> {
    const tokens = await DeviceToken.find({ user_id: new Types.ObjectId(userId) })
      .select('token')
      .lean()
      .exec();
    return tokens.map((doc) => doc.token);
  }

  async insertBatch(
    notifications: Array<{
      _id: Types.ObjectId;
      recipient_id: Types.ObjectId;
      title: string;
      message: string;
      type: NotificationType;
      category: NotificationCategory;
      action_url: string | null;
      data: Record<string, unknown> | null;
      is_read: boolean;
    }>,
  ): Promise<void> {
    if (notifications.length === 0) return;
    await Notification.insertMany(notifications, { ordered: false });
  }

  async countReadReceipts(broadcastId: string): Promise<number> {
    return Notification.countDocuments({
      'data.broadcast_id': broadcastId,
      is_read: true,
    }).exec();
  }

  async countReadReceiptsBatch(broadcastIds: string[]): Promise<Map<string, number>> {
    if (broadcastIds.length === 0) return new Map();
    const results = await Notification.aggregate<{ _id: string; count: number }>([
      { $match: { 'data.broadcast_id': { $in: broadcastIds }, is_read: true } },
      { $group: { _id: '$data.broadcast_id', count: { $sum: 1 } } },
    ]);
    return new Map(results.map((r) => [r._id, r.count]));
  }
}

export const notificationsRepository = new NotificationsRepository();
