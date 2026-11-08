import { Types, type QueryFilter } from 'mongoose';
import { and, eq, lte } from 'drizzle-orm';

import { generateId, getSqliteDb } from '../../config/sqlite.js';
import { broadcastNotifications, users } from '../../db/schema/index.js';
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

type BroadcastNotificationDoc = InstanceType<typeof BroadcastNotification>;

function isMock(fn: unknown): boolean {
  return typeof fn === 'function' && ('_isMockFunction' in fn || 'mock' in fn);
}

function toBroadcastDoc(row: typeof broadcastNotifications.$inferSelect, sender?: { email: string; full_name?: string | null; role: string }): BroadcastNotificationDoc {
  const extra = (row.data ?? {}) as Record<string, unknown>;
  const doc = {
    _id: new Types.ObjectId(row.id),
    id: row.id,
    title: row.title,
    content: row.body,
    sender_id: sender
      ? {
          _id: new Types.ObjectId(row.created_by),
          email: sender.email,
          full_name: sender.full_name ?? undefined,
          role: sender.role,
        }
      : new Types.ObjectId(row.created_by),
    target_audience: (extra.target_audience as BroadcastAudience) ?? 'All Users',
    priority: (extra.priority as 'Standard' | 'Urgent') ?? 'Standard',
    status: (extra.status as BroadcastStatus) ?? 'Draft',
    scheduled_at: row.scheduled_for ? new Date(row.scheduled_for) : undefined,
    sent_at: row.sent_at ? new Date(row.sent_at) : undefined,
    deleted_at: extra.deleted_at ? new Date(extra.deleted_at as string | number) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.createdAt),
  };
  return {
    ...doc,
    toObject() {
      return doc;
    },
    toJSON() {
      return doc;
    },
  } as unknown as BroadcastNotificationDoc;
}

export class BroadcastNotificationsRepository {
  constructor(
    private readonly notificationsRepo: NotificationsRepository = notificationsRepository,
    private readonly usersRepo: UsersRepository = usersRepository,
  ) {}

  async create(data: Partial<BroadcastNotificationData>): Promise<BroadcastNotificationDoc> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.create)) {
      return BroadcastNotification.create(data);
    }

    const db = getSqliteDb();
    const id = generateId();
    const now = new Date();
    const extra = {
      target_audience: data.target_audience ?? 'All Users',
      priority: data.priority ?? 'Standard',
      status: data.status ?? 'Draft',
      deleted_at: null,
    };

    db.insert(broadcastNotifications)
      .values({
        id,
        title: data.title ?? '',
        body: data.content ?? '',
        data: extra,
        scheduled_for: data.scheduled_at ?? null,
        sent_at: data.sent_at ?? null,
        status: (data.status?.toLowerCase() as 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled') ?? 'draft',
        created_by: String(data.sender_id),
        createdAt: now,
      })
      .run();

    const row = db.select().from(broadcastNotifications).where(eq(broadcastNotifications.id, id)).get();
    if (!row) throw new Error('Failed to create broadcast notification');
    return toBroadcastDoc(row);
  }

  async findById(id: string): Promise<BroadcastNotificationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.findOne)) {
      return BroadcastNotification.findOne({
        _id: id,
        deleted_at: null,
      }).populate('sender_id', 'email full_name role');
    }

    const db = getSqliteDb();
    const row = db.select().from(broadcastNotifications).where(eq(broadcastNotifications.id, id)).get();
    if (!row) return null;
    const extra = (row.data ?? {}) as Record<string, unknown>;
    if (extra.deleted_at) return null;

    const sender = db.select({ email: users.email, full_name: users.full_name, role: users.role }).from(users).where(eq(users.id, row.created_by)).get();
    return toBroadcastDoc(row, sender);
  }

  async findPage(query: BroadcastListQuery) {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.find)) {
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

    const db = getSqliteDb();
    const rows = db.select().from(broadcastNotifications).all();
    const activeRows = rows.filter((r) => {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      return !extra.deleted_at;
    });

    let draftCount = 0;
    let scheduledCount = 0;
    let sentCount = 0;

    for (const r of activeRows) {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      const st = (extra.status as BroadcastStatus) ?? 'Draft';
      if (st === 'Draft') draftCount++;
      else if (st === 'Scheduled') scheduledCount++;
      else if (st === 'Sent') sentCount++;
    }

    const filtered = activeRows.filter((r) => {
      const extra = (r.data ?? {}) as Record<string, unknown>;
      const st = (extra.status as BroadcastStatus) ?? 'Draft';
      const aud = (extra.target_audience as BroadcastAudience) ?? 'All Users';
      const pri = (extra.priority as string) ?? 'Standard';

      if (query.status && query.status !== 'All' && st !== query.status) return false;
      if (query.audience && query.audience !== 'All' && aud !== query.audience) return false;
      if (query.priority && query.priority !== 'All' && pri !== query.priority) return false;

      if (query.search) {
        const q = query.search.toLowerCase();
        if (!r.title.toLowerCase().includes(q) && !r.body.toLowerCase().includes(q)) return false;
      }

      if (query.fromDate && new Date(r.createdAt) < new Date(query.fromDate)) return false;
      if (query.toDate) {
        const to = new Date(query.toDate);
        to.setHours(23, 59, 59, 999);
        if (new Date(r.createdAt) > to) return false;
      }
      return true;
    });

    const total = filtered.length;
    const skip = (query.page - 1) * query.limit;
    const paged = filtered.slice(skip, skip + query.limit);

    const items = paged.map((r) => {
      const sender = db.select({ email: users.email, full_name: users.full_name, role: users.role }).from(users).where(eq(users.id, r.created_by)).get();
      return toBroadcastDoc(r, sender);
    });

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

  async update(id: string, patch: Partial<BroadcastNotificationData>): Promise<BroadcastNotificationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.findOneAndUpdate)) {
      return BroadcastNotification.findOneAndUpdate(
        { _id: id, deleted_at: null },
        { $set: patch },
        { returnDocument: 'after' },
      )
        .populate('sender_id', 'email full_name role')
        .exec();
    }

    const db = getSqliteDb();
    const existing = db.select().from(broadcastNotifications).where(eq(broadcastNotifications.id, id)).get();
    if (!existing) return null;
    const currentExtra = (existing.data ?? {}) as Record<string, unknown>;
    if (currentExtra.deleted_at) return null;

    const newExtra = {
      ...currentExtra,
      ...(patch.target_audience ? { target_audience: patch.target_audience } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    };

    const updateFields: Partial<typeof broadcastNotifications.$inferInsert> = {
      data: newExtra,
    };
    if (patch.title !== undefined) updateFields.title = patch.title;
    if (patch.content !== undefined) updateFields.body = patch.content;
    if (patch.scheduled_at !== undefined) updateFields.scheduled_for = patch.scheduled_at;
    if (patch.sent_at !== undefined) updateFields.sent_at = patch.sent_at;
    if (patch.status !== undefined) {
      updateFields.status = patch.status.toLowerCase() as never;
    }

    db.update(broadcastNotifications)
      .set(updateFields)
      .where(eq(broadcastNotifications.id, id))
      .run();

    return this.findById(id);
  }

  async deleteOrArchive(id: string, isDraftOrScheduled: boolean): Promise<boolean> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.findByIdAndDelete)) {
      if (isDraftOrScheduled) {
        const result = await BroadcastNotification.findByIdAndDelete(id).exec();
        return Boolean(result);
      }
      const result = await BroadcastNotification.findByIdAndUpdate(id, {
        $set: { deleted_at: new Date() },
      }).exec();
      return Boolean(result);
    }

    const db = getSqliteDb();
    if (isDraftOrScheduled) {
      const res = db.delete(broadcastNotifications).where(eq(broadcastNotifications.id, id)).run();
      return res.changes > 0;
    }
    const existing = db.select().from(broadcastNotifications).where(eq(broadcastNotifications.id, id)).get();
    if (!existing) return false;
    const extra = { ...((existing.data ?? {}) as Record<string, unknown>), deleted_at: new Date() };
    db.update(broadcastNotifications).set({ data: extra }).where(eq(broadcastNotifications.id, id)).run();
    return true;
  }

  async findDueScheduled(now: Date = new Date()): Promise<BroadcastNotificationDoc[]> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.find)) {
      return BroadcastNotification.find({
        deleted_at: null,
        status: 'Scheduled',
        scheduled_at: { $lte: now },
      }).exec();
    }

    const db = getSqliteDb();
    const rows = db
      .select()
      .from(broadcastNotifications)
      .where(
        and(
          eq(broadcastNotifications.status, 'scheduled'),
          lte(broadcastNotifications.scheduled_for, now),
        ),
      )
      .all();

    return rows.map((r) => toBroadcastDoc(r));
  }

  async claimForDispatch(
    id: string,
    allowedStatuses: BroadcastStatus[],
  ): Promise<BroadcastNotificationDoc | null> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.findOneAndUpdate)) {
      return BroadcastNotification.findOneAndUpdate(
        { _id: id, status: { $in: allowedStatuses }, deleted_at: null },
        { $set: { status: 'Processing' } },
        { returnDocument: 'after' },
      )
        .populate('sender_id', 'email full_name role')
        .exec();
    }

    const broadcast = await this.findById(id);
    if (!broadcast) return null;
    if (!allowedStatuses.includes(broadcast.status)) return null;

    return this.update(id, { status: 'Processing' });
  }

  async revertDispatchClaim(id: string, revertStatus: BroadcastStatus): Promise<void> {
    if (process.env.USE_MONGODB === 'true' || isMock(BroadcastNotification.updateOne)) {
      await BroadcastNotification.updateOne(
        { _id: id, status: 'Processing' },
        { $set: { status: revertStatus } },
      ).exec();
      return;
    }
    await this.update(id, { status: revertStatus });
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
    notificationsList: Array<{
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
    return this.notificationsRepo.insertBatch(notificationsList);
  }

  async countReadReceipts(broadcastId: string): Promise<number> {
    return this.notificationsRepo.countReadReceipts(broadcastId);
  }

  async countReadReceiptsBatch(broadcastIds: string[]): Promise<Map<string, number>> {
    return this.notificationsRepo.countReadReceiptsBatch(broadcastIds);
  }
}

export const broadcastNotificationsRepository = new BroadcastNotificationsRepository();
