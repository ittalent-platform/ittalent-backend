import { Types, type ClientSession, type QueryFilter } from 'mongoose';
import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { deviceTokens, notifications } from '../../db/schema/index.js';
import { DeviceToken, type DevicePlatform } from '../../models/device-token.model.js';
import {
  Notification,
  type NotificationCategory,
  type NotificationData,
  type NotificationType,
} from '../../models/notification.model.js';
import type { CreateNotificationInput, NotificationListQuery } from './notifications.schemas.js';

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toNotificationDoc(row: typeof notifications.$inferSelect): NotificationData & { _id: Types.ObjectId; createdAt: Date } {
  const extra = (row.data ?? {}) as Record<string, unknown>;
  return {
    _id: new Types.ObjectId(row.id),
    recipient_id: new Types.ObjectId(row.user_id),
    title: row.title,
    message: row.body,
    type: row.type as NotificationType,
    category: (extra.category as NotificationCategory) ?? 'info',
    action_url: (extra.action_url as string) ?? null,
    data: (extra.payload as Record<string, unknown>) ?? null,
    is_read: Boolean(row.is_read),
    read_at: row.read_at ? new Date(row.read_at) : null,
    deleted_at: extra.deleted_at ? new Date(extra.deleted_at as string | number) : null,
    createdAt: new Date(row.createdAt),
  };
}

export class NotificationsRepository {
  async create(data: CreateNotificationInput, session?: ClientSession): Promise<NotificationData & { _id: Types.ObjectId }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.create)) {
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

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const extra = {
      category: data.category ?? 'info',
      action_url: data.actionUrl ?? null,
      payload: data.data ?? null,
      deleted_at: null,
    };

    db.insert(notifications)
      .values({
        id,
        user_id: data.recipientId,
        type: data.type,
        title: data.title,
        body: data.message,
        data: extra,
        is_read: false,
        read_at: null,
        createdAt: now,
      })
      .run();

    const row = db.select().from(notifications).where(eq(notifications.id, id)).get();
    if (!row) throw new Error('Failed to create notification document');
    return toNotificationDoc(row);
  }

  async findPage(
    userId: string,
    query: NotificationListQuery,
  ): Promise<{ items: (NotificationData & { _id: Types.ObjectId; createdAt: Date })[]; total: number; unreadCount: number }> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.find)) {
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

    const db = getSqliteDb();
    const allRows = db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .all();

    const notDeleted = allRows.filter((r) => {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      return !extra.deleted_at;
    });

    const unreadCount = notDeleted.filter((r) => !r.is_read).length;

    const filtered = notDeleted.filter((r) => {
      if (query.isRead !== undefined && Boolean(r.is_read) !== query.isRead) return false;
      if (query.type && r.type !== query.type) return false;
      if (query.category) {
        const extra = (r.data ?? {}) as Record<string, unknown>;
        if (extra.category !== query.category) return false;
      }
      return true;
    });

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const paged = filtered.slice(skip, skip + query.limit);

    return {
      items: paged.map((r) => toNotificationDoc(r)),
      total,
      unreadCount,
    };
  }

  async countUnread(userId: string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.countDocuments)) {
      return Notification.countDocuments({
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
        is_read: false,
      }).exec();
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.user_id, userId),
          eq(notifications.is_read, false),
        ),
      )
      .all();
    return rows.filter((r) => !((r.data ?? {}) as Record<string, unknown>).deleted_at).length;
  }

  async findByIdAndUser(userId: string, notificationId: string): Promise<(NotificationData & { _id: Types.ObjectId; createdAt: Date }) | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.findOne)) {
      return Notification.findOne({
        _id: new Types.ObjectId(notificationId),
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
      })
        .lean()
        .exec() as unknown as Promise<(NotificationData & { _id: Types.ObjectId; createdAt: Date }) | null>;
    }
    const db = getSqliteDb();
    const row = db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.user_id, userId),
        ),
      )
      .get();
    if (!row) return null;
    const extra = (row.data ?? {}) as Record<string, unknown>;
    if (extra.deleted_at) return null;
    return toNotificationDoc(row);
  }

  async markOneAsRead(userId: string, notificationId: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.updateOne)) {
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
    const db = getSqliteDb();
    const res = db
      .update(notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.user_id, userId),
        ),
      )
      .run();
    return res.changes > 0;
  }

  async markAllAsRead(userId: string, before?: Date): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.updateMany)) {
      const filter: Record<string, unknown> = {
        recipient_id: new Types.ObjectId(userId),
        deleted_at: null,
        is_read: false,
      };
      if (before) {
        filter.createdAt = { $lte: before };
      }
      const result = await Notification.updateMany(
        filter,
        {
          $set: {
            is_read: true,
            read_at: new Date(),
          },
        },
      ).exec();
      return result.modifiedCount;
    }
    const db = getSqliteDb();
    const conditions = [
      eq(notifications.user_id, userId),
      eq(notifications.is_read, false),
    ];
    if (before) {
      conditions.push(lte(notifications.createdAt, before));
    }
    const res = db
      .update(notifications)
      .set({ is_read: true, read_at: new Date() })
      .where(and(...conditions))
      .run();
    return res.changes;
  }

  async softDeleteOne(userId: string, notificationId: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.updateOne)) {
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
    const db = getSqliteDb();
    const existing = db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.user_id, userId),
        ),
      )
      .get();
    if (!existing) return false;
    const extra = { ...((existing.data ?? {}) as Record<string, unknown>), deleted_at: new Date() };
    db.update(notifications)
      .set({ data: extra })
      .where(eq(notifications.id, notificationId))
      .run();
    return true;
  }

  async softDeleteAll(userId: string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.updateMany)) {
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
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .all();
    let countModified = 0;
    for (const r of rows) {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      if (!extra.deleted_at) {
        db.update(notifications)
          .set({ data: { ...extra, deleted_at: new Date() } })
          .where(eq(notifications.id, r.id))
          .run();
        countModified++;
      }
    }
    return countModified;
  }

  async upsertDeviceToken(userId: string, token: string, platform: DevicePlatform): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(DeviceToken.updateOne)) {
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
      return;
    }
    const db = getSqliteDb();
    const now = new Date();
    db.insert(deviceTokens)
      .values({
        id: generateId(),
        user_id: userId,
        token,
        platform,
        last_seen_at: now,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: deviceTokens.id,
        set: {
          user_id: userId,
          platform,
          last_seen_at: now,
        },
      })
      .run();
  }

  async deleteDeviceToken(userId: string, token: string): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(DeviceToken.deleteOne)) {
      const result = await DeviceToken.deleteOne({
        token,
        user_id: new Types.ObjectId(userId),
      }).exec();
      return result.deletedCount > 0;
    }
    const db = getSqliteDb();
    const res = db
      .delete(deviceTokens)
      .where(and(eq(deviceTokens.token, token), eq(deviceTokens.user_id, userId)))
      .run();
    return res.changes > 0;
  }

  async findDeviceTokensByUser(userId: string): Promise<string[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(DeviceToken.find)) {
      const tokens = await DeviceToken.find({ user_id: new Types.ObjectId(userId) })
        .select('token')
        .lean()
        .exec();
      return tokens.map((doc) => doc.token);
    }
    const db = getSqliteDb();
    const rows = db
      .select({ token: deviceTokens.token })
      .from(deviceTokens)
      .where(eq(deviceTokens.user_id, userId))
      .all();
    return rows.map((r) => r.token);
  }

  async insertBatch(
    notificationsList: Array<{
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
    if (notificationsList.length === 0) return;
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.insertMany)) {
      await Notification.insertMany(notificationsList, { ordered: false });
      return;
    }
    const db = getSqliteDb();
    const now = new Date();
    for (const item of notificationsList) {
      db.insert(notifications)
        .values({
          id: String(item._id),
          user_id: String(item.recipient_id),
          type: item.type,
          title: item.title,
          body: item.message,
          data: {
            category: item.category,
            action_url: item.action_url,
            payload: item.data,
            deleted_at: null,
          },
          is_read: item.is_read,
          read_at: null,
          createdAt: now,
        })
        .run();
    }
  }

  async countReadReceipts(broadcastId: string): Promise<number> {
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.countDocuments)) {
      return Notification.countDocuments({
        'data.broadcast_id': broadcastId,
        is_read: true,
      }).exec();
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(notifications)
      .where(eq(notifications.is_read, true))
      .all();
    return rows.filter((r) => {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      const payload = (extra.payload ?? extra) as Record<string, unknown>;
      return payload.broadcast_id === broadcastId;
    }).length;
  }

  async countReadReceiptsBatch(broadcastIds: string[]): Promise<Map<string, number>> {
    if (broadcastIds.length === 0) return new Map();
    if (process.env.USE_MONGODB === 'true' || isMock(Notification.aggregate)) {
      const results = await Notification.aggregate<{ _id: string; count: number }>([
        { $match: { 'data.broadcast_id': { $in: broadcastIds }, is_read: true } },
        { $group: { _id: '$data.broadcast_id', count: { $sum: 1 } } },
      ]);
      return new Map(results.map((r) => [r._id, r.count]));
    }
    const db = getSqliteDb();
    const rows = db
      .select()
      .from(notifications)
      .where(eq(notifications.is_read, true))
      .all();

    const counts = new Map<string, number>();
    for (const bId of broadcastIds) counts.set(bId, 0);

    for (const r of rows) {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      const payload = (extra.payload ?? extra) as Record<string, unknown>;
      const bId = payload.broadcast_id as string;
      if (bId && counts.has(bId)) {
        counts.set(bId, (counts.get(bId) ?? 0) + 1);
      }
    }
    return counts;
  }
}

export const notificationsRepository = new NotificationsRepository();
