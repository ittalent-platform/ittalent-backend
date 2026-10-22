import type { QueryFilter, Types } from 'mongoose';
import {
  BroadcastNotification,
  type BroadcastAudience,
  type BroadcastNotificationData,
  type BroadcastStatus,
} from '../../models/broadcast-notification.model.js';
import type { UserRole } from '../../models/user.model.js';
import {
  notificationsRepository,
  type NotificationsRepository,
} from '../notifications/notifications.repository.js';
import {
  usersRepository,
  type UsersRepository,
} from '../users/users.repository.js';
import type { BroadcastListQuery } from './broadcast-notifications.schemas.js';

export class BroadcastNotificationsRepository {
  constructor(
    private readonly notificationsRepo: NotificationsRepository = notificationsRepository,
    private readonly usersRepo: UsersRepository = usersRepository,
  ) {}

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

  async claimForDispatch(
    id: string,
    allowedStatuses: BroadcastStatus[],
  ) {
    return BroadcastNotification.findOneAndUpdate(
      { _id: id, status: { $in: allowedStatuses }, deleted_at: null },
      { $set: { status: 'Processing' } },
      { returnDocument: 'after' },
    )
      .populate('sender_id', 'email full_name role')
      .exec();
  }

  async revertDispatchClaim(id: string, revertStatus: BroadcastStatus): Promise<void> {
    await BroadcastNotification.updateOne(
      { _id: id, status: 'Processing' },
      { $set: { status: revertStatus } },
    ).exec();
  }

  async getTargetUserIds(audience: BroadcastAudience): Promise<Types.ObjectId[]> {
    let roles: UserRole[] | undefined;
    if (audience === 'Applicants only') {
      roles = ['applicant', 'user'];
    } else if (audience === 'Recruiters only') {
      roles = ['recruiter'];
    } else if (audience === 'Enterprise Admins') {
      roles = ['enterprise_admin'];
    }
    return this.usersRepo.findActiveUserIdsByRoles(roles);
  }

  async insertRecipientNotifications(
    notifications: Array<{
      _id: Types.ObjectId;
      recipient_id: Types.ObjectId;
      title: string;
      message: string;
      type: 'system_announcement';
      category: 'info' | 'warning';
      action_url: string | null;
      data: Record<string, unknown> | null;
      is_read: boolean;
    }>,
  ): Promise<void> {
    return this.notificationsRepo.insertBatch(notifications);
  }

  async countReadReceipts(broadcastId: string): Promise<number> {
    return this.notificationsRepo.countReadReceipts(broadcastId);
  }

  async countReadReceiptsBatch(broadcastIds: string[]): Promise<Map<string, number>> {
    return this.notificationsRepo.countReadReceiptsBatch(broadcastIds);
  }
}

export const broadcastNotificationsRepository = new BroadcastNotificationsRepository();
