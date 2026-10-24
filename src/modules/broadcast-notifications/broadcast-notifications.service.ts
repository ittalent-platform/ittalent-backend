import { Types } from 'mongoose';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { notificationBus, type NotificationBus } from '../notifications/notifications.bus.js';
import {
  BROADCAST_MESSAGES,
  MIN_SCHEDULE_ADVANCE_MS,
} from './broadcast-notifications.constants.js';
import type {
  BroadcastAudience,
  BroadcastCategory,
  BroadcastChannel,
  BroadcastPriority,
  BroadcastStatus,
} from '../../models/broadcast-notification.model.js';
import {
  broadcastNotificationsRepository,
  type BroadcastNotificationsRepository,
} from './broadcast-notifications.repository.js';
import type {
  BroadcastListQuery,
  BroadcastListResponse,
  BroadcastNotificationDto,
  CreateBroadcastNotificationInput,
  ScheduleBroadcastNotificationInput,
  UpdateBroadcastNotificationInput,
} from './broadcast-notifications.schemas.js';

export interface ActorPayload {
  sub: string;
  email: string;
  role: string;
}

interface RawSender {
  _id?: Types.ObjectId | string;
  email?: string;
  full_name?: string | null;
  role?: string;
}

export interface RawBroadcastDoc {
  _id: Types.ObjectId | string;
  title: string;
  content: string;
  category: BroadcastCategory;
  target_audience: BroadcastAudience;
  priority: BroadcastPriority;
  channels?: BroadcastChannel[];
  status: BroadcastStatus;
  scheduled_at?: Date | null;
  sent_at?: Date | null;
  action_url?: string | null;
  action_label?: string | null;
  sender_id?: Types.ObjectId | RawSender | null;
  delivery_metrics?: {
    targeted_count?: number;
    delivered_count?: number;
    read_count?: number;
    failed_count?: number;
  };
  created_at?: Date;
  updated_at?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const CHUNK_SIZE = 1000;

export class BroadcastNotificationsService {
  constructor(
    private readonly repository: BroadcastNotificationsRepository = broadcastNotificationsRepository,
    private readonly bus: NotificationBus = notificationBus,
  ) {}

  private mapDto(
    doc: RawBroadcastDoc,
    liveReadCount?: number,
  ): BroadcastNotificationDto {
    const rawSender = doc.sender_id as RawSender | undefined;
    const sender = rawSender && typeof rawSender === 'object' && 'email' in rawSender && rawSender.email
      ? {
          id: (rawSender._id || rawSender).toString(),
          email: rawSender.email,
          fullName: rawSender.full_name || null,
          role: rawSender.role as
            | 'admin'
            | 'applicant'
            | 'recruiter'
            | 'enterprise_admin'
            | undefined,
        }
      : undefined;

    const targeted = doc.delivery_metrics?.targeted_count ?? 0;
    const delivered = doc.delivery_metrics?.delivered_count ?? 0;
    const read = liveReadCount !== undefined ? liveReadCount : (doc.delivery_metrics?.read_count ?? 0);
    const readPercentage = targeted > 0 ? Math.round((read / targeted) * 1000) / 10 : 0;
    const createdDate = doc.createdAt ?? doc.created_at ?? new Date();
    const updatedDate = doc.updatedAt ?? doc.updated_at ?? new Date();

    return {
      id: doc._id.toString(),
      title: doc.title,
      content: doc.content,
      category: doc.category,
      targetAudience: doc.target_audience,
      priority: doc.priority,
      actionUrl: doc.action_url ?? null,
      actionLabel: doc.action_label ?? null,
      channels: doc.channels ?? ['In-App Inbox'],
      status: doc.status,
      scheduledAt: doc.scheduled_at ? new Date(doc.scheduled_at).toISOString() : null,
      sentAt: doc.sent_at ? new Date(doc.sent_at).toISOString() : null,
      sender,
      deliveryMetrics: {
        targetedCount: targeted,
        deliveredCount: delivered,
        readCount: read,
        readPercentage,
      },
      createdAt: new Date(createdDate).toISOString(),
      updatedAt: new Date(updatedDate).toISOString(),
    };
  }

  async create(actor: ActorPayload, input: CreateBroadcastNotificationInput): Promise<BroadcastNotificationDto> {
    const isDraft = input.is_draft ?? false;
    const senderId = new Types.ObjectId(actor.sub);

    const initialData = {
      title: input.title,
      content: input.content,
      category: input.category,
      target_audience: input.target_audience,
      priority: input.priority,
      action_url: input.action_url ?? null,
      action_label: input.action_label ?? null,
      channels: input.channels,
      status: (isDraft ? 'Draft' : 'Sent') as BroadcastStatus,
      sent_at: isDraft ? null : new Date(),
      sender_id: senderId,
      delivery_metrics: {
        targeted_count: 0,
        delivered_count: 0,
        read_count: 0,
      },
    };

    const created = await this.repository.create(initialData);
    const broadcast = created as unknown as RawBroadcastDoc;

    if (!isDraft) {
      await this.executeDispatch(broadcast);
    }

    const reloaded = await this.repository.findById(broadcast._id.toString());
    return this.mapDto((reloaded || broadcast) as unknown as RawBroadcastDoc);
  }

  async list(query: BroadcastListQuery): Promise<BroadcastListResponse> {
    const { items, total, summary } = await this.repository.findPage(query);

    const sentIds = items
      .filter((doc) => doc.status === 'Sent')
      .map((doc) => doc._id.toString());
    const readReceiptsMap = await this.repository.countReadReceiptsBatch(sentIds);

    const mappedItems: BroadcastNotificationDto[] = items.map((doc) => {
      const liveRead = doc.status === 'Sent'
        ? (readReceiptsMap.get(doc._id.toString()) ?? doc.delivery_metrics?.read_count ?? 0)
        : undefined;
      return this.mapDto(doc as unknown as RawBroadcastDoc, liveRead);
    });

    const totalPages = total > 0 ? Math.ceil(total / query.limit) : 0;

    return {
      items: mappedItems,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      summary,
    };
  }

  async getById(id: string): Promise<BroadcastNotificationDto> {
    const broadcast = await this.repository.findById(id);
    if (!broadcast) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    let liveRead: number | undefined;
    if (broadcast.status === 'Sent') {
      liveRead = await this.repository.countReadReceipts(broadcast._id.toString());
    }

    return this.mapDto(broadcast as unknown as RawBroadcastDoc, liveRead);
  }

  async update(actor: ActorPayload, id: string, input: UpdateBroadcastNotificationInput): Promise<BroadcastNotificationDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    if (existing.status === 'Sent') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, BROADCAST_MESSAGES.ALREADY_SENT_CANNOT_EDIT);
    }

    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.content !== undefined) patch.content = input.content;
    if (input.category !== undefined) patch.category = input.category;
    if (input.target_audience !== undefined) patch.target_audience = input.target_audience;
    if (input.priority !== undefined) patch.priority = input.priority;
    if (input.action_url !== undefined) patch.action_url = input.action_url;
    if (input.action_label !== undefined) patch.action_label = input.action_label;
    if (input.channels !== undefined) patch.channels = input.channels;

    const updated = await this.repository.update(id, patch);
    return this.mapDto((updated || existing) as unknown as RawBroadcastDoc);
  }

  async schedule(actor: ActorPayload, id: string, input: ScheduleBroadcastNotificationInput): Promise<BroadcastNotificationDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    if (existing.status === 'Sent') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, BROADCAST_MESSAGES.ALREADY_SENT_CANNOT_SCHEDULE);
    }

    const scheduledDate = new Date(input.scheduled_at);
    if (scheduledDate.getTime() < Date.now() + MIN_SCHEDULE_ADVANCE_MS) {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, BROADCAST_MESSAGES.SCHEDULE_TIME_TOO_SOON);
    }

    const updated = await this.repository.update(id, {
      status: 'Scheduled',
      scheduled_at: scheduledDate,
    });

    return this.mapDto((updated || existing) as unknown as RawBroadcastDoc);
  }

  async cancelSchedule(actor: ActorPayload, id: string): Promise<BroadcastNotificationDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    if (existing.status !== 'Scheduled') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, BROADCAST_MESSAGES.NOT_SCHEDULED);
    }

    const updated = await this.repository.update(id, {
      status: 'Draft',
      scheduled_at: null,
    });

    return this.mapDto((updated || existing) as unknown as RawBroadcastDoc);
  }

  async dispatchNow(actor: ActorPayload, id: string): Promise<BroadcastNotificationDto> {
    const claimed = await this.repository.claimForDispatch(id, ['Draft', 'Scheduled']);
    if (!claimed) {
      const existing = await this.repository.findById(id);
      if (!existing) {
        throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
      }
      if (existing.status === 'Sent') {
        throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Broadcast notification has already been dispatched');
      }
      throw createHttpError(HTTP_STATUS.HTTP_409_CONFLICT, 'Broadcast is already being processed');
    }

    try {
      await this.executeDispatch(claimed as unknown as RawBroadcastDoc);
    } catch (err) {
      await this.repository.revertDispatchClaim(id, 'Draft');
      throw err;
    }

    const updated = await this.repository.findById(id);
    return this.mapDto((updated || claimed) as unknown as RawBroadcastDoc);
  }

  async delete(actor: ActorPayload, id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    const isDraftOrScheduled = existing.status === 'Draft' || existing.status === 'Scheduled';
    await this.repository.deleteOrArchive(id, isDraftOrScheduled);

    return {
      success: true,
      message: BROADCAST_MESSAGES.DELETED,
    };
  }

  async executeDispatch(broadcast: RawBroadcastDoc): Promise<void> {
    const targetUserIds = await this.repository.getTargetUserIds(broadcast.target_audience);
    const targetedCount = targetUserIds.length;

    if (targetedCount > 0) {
      const notificationCategory =
        broadcast.category === 'Security Alert' ? 'warning' : 'info';

      for (let i = 0; i < targetUserIds.length; i += CHUNK_SIZE) {
        const chunk = targetUserIds.slice(i, i + CHUNK_SIZE);
        const notifications = chunk.map((userId) => {
          const notificationId = new Types.ObjectId();
          return {
            _id: notificationId,
            recipient_id: userId,
            title: broadcast.title,
            message: broadcast.content,
            type: 'system_announcement' as const,
            category: notificationCategory as 'info' | 'warning',
            action_url: null, // BC-INBOX-09: Announcements suppress action links
            data: {
              broadcast_id: broadcast._id.toString(),
              category: broadcast.category,
              priority: broadcast.priority,
            },
            is_read: false,
          };
        });

        await this.repository.insertRecipientNotifications(notifications);

        for (const item of notifications) {
          const userIdStr = item.recipient_id.toString();
          if (this.bus.getUserListenerCount(userIdStr) > 0) {
            this.bus.emitNotification(userIdStr, {
              id: item._id.toString(),
              title: item.title,
              message: item.message,
              type: item.type,
              category: item.category,
              actionUrl: null,
              data: item.data,
              isRead: false,
              readAt: null,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    await this.repository.update(broadcast._id.toString(), {
      status: 'Sent',
      sent_at: new Date(),
      delivery_metrics: {
        targeted_count: targetedCount,
        delivered_count: targetedCount,
        read_count: 0,
      },
    });
  }

  async processDueScheduledBroadcasts(): Promise<number> {
    const dueBroadcasts = await this.repository.findDueScheduled(new Date());
    let dispatchedCount = 0;

    for (const b of dueBroadcasts) {
      const id = b._id.toString();
      const claimed = await this.repository.claimForDispatch(id, ['Scheduled']);
      if (!claimed) {
        continue;
      }

      try {
        await this.executeDispatch(claimed as unknown as RawBroadcastDoc);
        dispatchedCount++;
      } catch (err) {
        await this.repository.revertDispatchClaim(id, 'Scheduled');
        console.error(`Failed to dispatch scheduled broadcast ${id}:`, err);
      }
    }

    return dispatchedCount;
  }

  startBroadcastScheduler(intervalMs: number = 30000): () => void {
    void this.processDueScheduledBroadcasts();

    const timer = setInterval(() => {
      void this.processDueScheduledBroadcasts();
    }, intervalMs);

    return () => clearInterval(timer);
  }
}

export const broadcastNotificationsService = new BroadcastNotificationsService();
