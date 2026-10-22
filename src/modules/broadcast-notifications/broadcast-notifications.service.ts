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
      delivery_metrics: { targeted_count: 0, delivered_count: 0, read_count: 0 },
    };

    const broadcast = await this.repository.create(initialData);

    if (!isDraft) {
      await this.executeDispatch(broadcast);
    }

    const reloaded = await this.repository.findById(broadcast._id.toString());
    return this.mapDto(reloaded || broadcast);
  }

  async list(query: BroadcastListQuery): Promise<BroadcastListResponse> {
    const { items, total, summary } = await this.repository.findPage(query);

    const mappedItems: BroadcastNotificationDto[] = await Promise.all(
      items.map(async (doc) => {
        let liveRead: number | undefined;
        if (doc.status === 'Sent') {
          liveRead = await this.repository.countReadReceipts(doc._id.toString());
        }
        return this.mapDto(doc, liveRead);
      }),
    );

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

    return this.mapDto(broadcast, liveRead);
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
    return this.mapDto(updated || existing);
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

    return this.mapDto(updated || existing);
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

    return this.mapDto(updated || existing);
  }

  async dispatchNow(actor: ActorPayload, id: string): Promise<BroadcastNotificationDto> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, BROADCAST_MESSAGES.NOT_FOUND);
    }

    if (existing.status === 'Sent') {
      throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Broadcast notification has already been dispatched');
    }

    await this.executeDispatch(existing);

    const updated = await this.repository.findById(id);
    return this.mapDto(updated || existing);
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

      const notifications = targetUserIds.map((userId) => ({
        recipient_id: userId,
        title: broadcast.title,
        message: broadcast.content,
        type: 'system_announcement' as const,
        category: notificationCategory,
        action_url: broadcast.action_url ?? null,
        data: {
          broadcast_id: broadcast._id.toString(),
          category: broadcast.category,
          priority: broadcast.priority,
        },
        is_read: false,
      }));

      // Insert notifications into recipients' inboxes via repository
      await this.repository.insertRecipientNotifications(notifications);

      // Emit SSE events to active clients
      const broadcastDto = {
        id: broadcast._id.toString(),
        title: broadcast.title,
        message: broadcast.content,
        type: 'system_announcement' as const,
        category: (broadcast.category === 'Security Alert' ? 'warning' : 'info') as 'info' | 'warning',
        actionUrl: broadcast.action_url ?? null,
        data: {
          broadcast_id: broadcast._id.toString(),
          category: broadcast.category,
          priority: broadcast.priority,
        },
        isRead: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      };

      for (const userId of targetUserIds) {
        this.bus.emitNotification(userId.toString(), broadcastDto);
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
      try {
        await this.executeDispatch(b);
        dispatchedCount++;
      } catch (err) {
        console.error(`Failed to dispatch scheduled broadcast ${b._id}:`, err);
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
