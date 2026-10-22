import type { QueryFilter, Types } from 'mongoose';
import {
  BroadcastNotification,
  type BroadcastAudience,
  type BroadcastNotificationData,
} from '../../models/broadcast-notification.model.js';
import { Notification } from '../../models/notification.model.js';
import { User } from '../../models/user.model.js';
import type { BroadcastListQuery } from './broadcast-notifications.schemas.js';

export class BroadcastNotificationsRepository {
  async create(data: Partial<BroadcastNotificationData>) {
    return BroadcastNotification.create(data);
  }

  async findById(id: string) {
    return BroadcastNotification.findOne({
      _id: id,
      deleted_at: null,
    }).populate('sender_id', 'email full_name role');
  }

  async findPage(query: BroadcastListQuery) {
    const filter: QueryFilter<BroadcastNotificationData> = {
      deleted_at: null,
    };

    if (query.status && query.status !== 'All') {
      filter.status = query.status;
    }

    if (query.audience && query.audience !== 'All') {
      filter.target_audience = query.audience;
    }

    if (query.priority && query.priority !== 'All') {
      filter.priority = query.priority;
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ title: searchRegex }, { content: searchRegex }];
    }

    if (query.fromDate || query.toDate) {
      filter.createdAt = {};
      if (query.fromDate) {
        filter.createdAt.$gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = to;
      }
    }

    const sortField = query.sortBy || 'createdAt';
    const sortDirection = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortDirection };

    const skip = (query.page - 1) * query.limit;

    const [items, total, draftCount, scheduledCount, sentCount] = await Promise.all([
      BroadcastNotification.find(filter)
        .populate('sender_id', 'email full_name role')
        .sort(sort)
        .skip(skip)
        .limit(query.limit)
        .exec(),
      BroadcastNotification.countDocuments(filter).exec(),
      BroadcastNotification.countDocuments({ deleted_at: null, status: 'Draft' }).exec(),
      BroadcastNotification.countDocuments({ deleted_at: null, status: 'Scheduled' }).exec(),
      BroadcastNotification.countDocuments({ deleted_at: null, status: 'Sent' }).exec(),
    ]);

    return {
      items,
      total,
      summary: {
        total: draftCount + scheduledCount + sentCount,
        drafts: draftCount,
        scheduled: scheduledCount,
        sent: sentCount,
      },
    };
  }

  async update(id: string, patch: Partial<BroadcastNotificationData>) {
    return BroadcastNotification.findOneAndUpdate(
      { _id: id, deleted_at: null },
      { $set: patch },
      { returnDocument: 'after' },
    )
      .populate('sender_id', 'email full_name role')
      .exec();
  }

  async deleteOrArchive(id: string, isDraftOrScheduled: boolean): Promise<boolean> {
    if (isDraftOrScheduled) {
      const result = await BroadcastNotification.findByIdAndDelete(id).exec();
      return Boolean(result);
    }
    const result = await BroadcastNotification.findByIdAndUpdate(id, {
      $set: { deleted_at: new Date() },
    }).exec();
    return Boolean(result);
  }

  async findDueScheduled(now: Date = new Date()) {
    return BroadcastNotification.find({
      deleted_at: null,
      status: 'Scheduled',
      scheduled_at: { $lte: now },
    }).exec();
  }

  async getTargetUserIds(audience: BroadcastAudience): Promise<Types.ObjectId[]> {
    let query: Record<string, unknown> = { status: 'active' };

    if (audience === 'Applicants only') {
      query = { status: 'active', role: { $in: ['applicant', 'user'] } };
    } else if (audience === 'Recruiters only') {
      query = { status: 'active', role: 'recruiter' };
    } else if (audience === 'Enterprise Admins') {
      query = { status: 'active', role: 'enterprise_admin' };
    }

    const users = await User.find(query).select('_id').lean().exec();
    return users.map((u) => u._id as Types.ObjectId);
  }

  async insertRecipientNotifications(notifications: Record<string, unknown>[]): Promise<void> {
    if (notifications.length === 0) return;
    const chunkSize = 500;
    for (let i = 0; i < notifications.length; i += chunkSize) {
      const chunk = notifications.slice(i, i + chunkSize);
      await Notification.insertMany(chunk, { ordered: false });
    }
  }

  async countReadReceipts(broadcastId: string): Promise<number> {
    return Notification.countDocuments({
      'data.broadcast_id': broadcastId,
      is_read: true,
    }).exec();
  }
}

export const broadcastNotificationsRepository = new BroadcastNotificationsRepository();
