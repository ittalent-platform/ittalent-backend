import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import {
  BROADCAST_MESSAGES,
  MIN_SCHEDULE_ADVANCE_MS,
} from '../../../src/modules/broadcast-notifications/broadcast-notifications.constants.js';
import type { BroadcastNotificationsRepository } from '../../../src/modules/broadcast-notifications/broadcast-notifications.repository.js';
import { BroadcastNotificationsService } from '../../../src/modules/broadcast-notifications/broadcast-notifications.service.js';
import type { NotificationBus } from '../../../src/modules/notifications/notifications.bus.js';

describe('BroadcastNotificationsService (UC 01 through UC 07)', () => {
  let mockRepository: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findPage: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteOrArchive: ReturnType<typeof vi.fn>;
    findDueScheduled: ReturnType<typeof vi.fn>;
    getTargetUserIds: ReturnType<typeof vi.fn>;
    insertRecipientNotifications: ReturnType<typeof vi.fn>;
    countReadReceipts: ReturnType<typeof vi.fn>;
    countReadReceiptsBatch: ReturnType<typeof vi.fn>;
    claimForDispatch: ReturnType<typeof vi.fn>;
    revertDispatchClaim: ReturnType<typeof vi.fn>;
  };
  let mockBus: {
    emitNotification: ReturnType<typeof vi.fn>;
    getUserListenerCount: ReturnType<typeof vi.fn>;
  };
  let service: BroadcastNotificationsService;

  const adminActor = {
    sub: new Types.ObjectId().toString(),
    email: 'admin@italent.com',
    role: 'admin',
  };

  beforeEach(() => {
    mockRepository = {
      create: vi.fn(),
      findById: vi.fn(),
      findPage: vi.fn(),
      update: vi.fn(),
      deleteOrArchive: vi.fn(),
      findDueScheduled: vi.fn(),
      getTargetUserIds: vi.fn(),
      insertRecipientNotifications: vi.fn(),
      countReadReceipts: vi.fn(),
      countReadReceiptsBatch: vi.fn().mockResolvedValue(new Map()),
      claimForDispatch: vi.fn(),
      revertDispatchClaim: vi.fn(),
    };
    mockBus = {
      emitNotification: vi.fn(),
      getUserListenerCount: vi.fn().mockReturnValue(1),
    };
    service = new BroadcastNotificationsService(
      mockRepository as unknown as BroadcastNotificationsRepository,
      mockBus as unknown as NotificationBus,
    );
  });

  describe('UC-01: Create a broadcast notification', () => {
    it('creates a draft broadcast notification without recipient dispatch', async () => {
      const mockId = new Types.ObjectId();
      const now = new Date();
      const mockDoc = {
        _id: mockId,
        title: 'System Maintenance Window',
        content: 'System will undergo planned maintenance this Saturday at 23:00 UTC.',
        category: 'System Maintenance',
        target_audience: 'All Users',
        priority: 'Normal',
        channels: ['In-App Inbox'],
        status: 'Draft',
        sent_at: null,
        scheduled_at: null,
        sender_id: {
          _id: new Types.ObjectId(adminActor.sub),
          email: adminActor.email,
          full_name: 'Sys Admin',
          role: 'admin',
        },
        delivery_metrics: { targeted_count: 0, delivered_count: 0, read_count: 0 },
        createdAt: now,
        updatedAt: now,
      };

      mockRepository.create.mockResolvedValue(mockDoc);
      mockRepository.findById.mockResolvedValue(mockDoc);

      const result = await service.create(adminActor, {
        title: 'System Maintenance Window',
        content: 'System will undergo planned maintenance this Saturday at 23:00 UTC.',
        category: 'System Maintenance',
        target_audience: 'All Users',
        priority: 'Normal',
        channels: ['In-App Inbox'],
        is_draft: true,
      });

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'System Maintenance Window',
          status: 'Draft',
          sent_at: null,
        }),
      );
      expect(result.status).toBe('Draft');
      expect(result.title).toBe('System Maintenance Window');
      expect(mockRepository.getTargetUserIds).not.toHaveBeenCalled();
    });

    it('creates and immediately dispatches broadcast when is_draft is false with real notification IDs', async () => {
      const mockId = new Types.ObjectId();
      const user1 = new Types.ObjectId();
      const user2 = new Types.ObjectId();
      const now = new Date();

      const mockDoc = {
        _id: mockId,
        title: 'Emergency Security Alert',
        content: 'Please review your password settings immediately.',
        category: 'Security Alert',
        target_audience: 'Applicants only',
        priority: 'Urgent',
        channels: ['In-App Inbox'],
        status: 'Sent',
        sent_at: now,
        sender_id: {
          _id: new Types.ObjectId(adminActor.sub),
          email: adminActor.email,
          full_name: 'Sys Admin',
          role: 'admin',
        },
        delivery_metrics: { targeted_count: 2, delivered_count: 2, read_count: 0 },
        createdAt: now,
        updatedAt: now,
      };

      mockRepository.create.mockResolvedValue(mockDoc);
      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.getTargetUserIds.mockResolvedValue([user1, user2]);
      mockRepository.update.mockResolvedValue(mockDoc);

      const result = await service.create(adminActor, {
        title: 'Emergency Security Alert',
        content: 'Please review your password settings immediately.',
        category: 'Security Alert',
        target_audience: 'Applicants only',
        priority: 'Urgent',
        channels: ['In-App Inbox'],
        is_draft: false,
      });

      expect(mockRepository.getTargetUserIds).toHaveBeenCalledWith('Applicants only');
      expect(mockRepository.insertRecipientNotifications).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            _id: expect.any(Types.ObjectId),
            recipient_id: user1,
            title: 'Emergency Security Alert',
            type: 'system_announcement',
            category: 'warning',
            data: expect.objectContaining({
              broadcast_id: mockId.toString(),
            }),
          }),
        ]),
      );
      expect(mockBus.emitNotification).toHaveBeenCalledTimes(2);
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockId.toString(),
        expect.objectContaining({
          status: 'Sent',
          delivery_metrics: { targeted_count: 2, delivered_count: 2, read_count: 0 },
        }),
      );
      expect(result.status).toBe('Sent');
    });
  });

  describe('UC-02 & UC-07: View list and Filter/Search broadcast notifications', () => {
    it('returns paginated list and summary metrics with real-time read rate via batching', async () => {
      const mockId = new Types.ObjectId();
      const now = new Date();
      const mockDoc = {
        _id: mockId,
        title: 'Feature Release v2.4',
        content: 'New candidate profile features are now live.',
        category: 'Feature Update',
        target_audience: 'All Users',
        priority: 'Normal',
        channels: ['In-App Inbox'],
        status: 'Sent',
        delivery_metrics: { targeted_count: 100, delivered_count: 100, read_count: 0 },
        createdAt: now,
        updatedAt: now,
      };

      mockRepository.findPage.mockResolvedValue({
        items: [mockDoc],
        total: 1,
        summary: { total: 1, drafts: 0, scheduled: 0, sent: 1 },
      });
      mockRepository.countReadReceiptsBatch.mockResolvedValue(new Map([[mockId.toString(), 45]]));

      const result = await service.list({
        page: 1,
        limit: 10,
        search: 'v2.4',
        status: 'Sent',
        audience: 'All Users',
        priority: 'Normal',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]?.deliveryMetrics.readCount).toBe(45);
      expect(result.items[0]?.deliveryMetrics.readPercentage).toBe(45);
      expect(result.summary.sent).toBe(1);
      expect(mockRepository.countReadReceiptsBatch).toHaveBeenCalledWith([mockId.toString()]);
    });
  });

  describe('UC-03: View broadcast notification detail', () => {
    it('returns complete broadcast details with live engagement analytics', async () => {
      const mockId = new Types.ObjectId();
      const now = new Date();
      const mockDoc = {
        _id: mockId,
        title: 'Terms of Service Update',
        content: 'We have updated our terms and conditions.',
        category: 'Policy Update',
        target_audience: 'All Users',
        priority: 'Normal',
        status: 'Sent',
        delivery_metrics: { targeted_count: 50, delivered_count: 50, read_count: 0 },
        createdAt: now,
        updatedAt: now,
      };

      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.countReadReceipts.mockResolvedValue(25);

      const result = await service.getById(mockId.toString());

      expect(result.title).toBe('Terms of Service Update');
      expect(result.deliveryMetrics.readCount).toBe(25);
      expect(result.deliveryMetrics.readPercentage).toBe(50);
    });

    it('throws 404 when target broadcast does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.getById(new Types.ObjectId().toString())).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_404_NOT_FOUND,
        message: BROADCAST_MESSAGES.NOT_FOUND,
      });
    });
  });

  describe('UC-04: Schedule broadcast notification', () => {
    it('schedules draft broadcast with valid future timestamp', async () => {
      const mockId = new Types.ObjectId();
      const validFuture = new Date(Date.now() + MIN_SCHEDULE_ADVANCE_MS + 60000);
      const mockDoc = {
        _id: mockId,
        title: 'Upcoming Scheduled Notice',
        status: 'Draft',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.update.mockResolvedValue({
        ...mockDoc,
        status: 'Scheduled',
        scheduled_at: validFuture,
      });

      const result = await service.schedule(adminActor, mockId.toString(), {
        scheduled_at: validFuture.toISOString(),
      });

      expect(result.status).toBe('Scheduled');
      expect(mockRepository.update).toHaveBeenCalledWith(
        mockId.toString(),
        expect.objectContaining({
          status: 'Scheduled',
          scheduled_at: validFuture,
        }),
      );
    });

    it('rejects scheduling if scheduled_at is less than 15 minutes ahead (BR-BCN-10)', async () => {
      const mockId = new Types.ObjectId();
      const tooSoon = new Date(Date.now() + 5 * 60 * 1000);

      const mockDoc = {
        _id: mockId,
        title: 'Upcoming Notice',
        status: 'Draft',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);

      await expect(
        service.schedule(adminActor, mockId.toString(), {
          scheduled_at: tooSoon.toISOString(),
        }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: BROADCAST_MESSAGES.SCHEDULE_TIME_TOO_SOON,
      });
    });

    it('rejects scheduling if broadcast is already Sent (BR-BCN-12)', async () => {
      const mockId = new Types.ObjectId();
      const validFuture = new Date(Date.now() + 60 * 60 * 1000);
      const mockDoc = {
        _id: mockId,
        title: 'Dispatched Notice',
        status: 'Sent',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);

      await expect(
        service.schedule(adminActor, mockId.toString(), {
          scheduled_at: validFuture.toISOString(),
        }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: BROADCAST_MESSAGES.ALREADY_SENT_CANNOT_SCHEDULE,
      });
    });
  });

  describe('UC-05: Update broadcast notification information', () => {
    it('updates draft or scheduled broadcast content', async () => {
      const mockId = new Types.ObjectId();
      const mockDoc = {
        _id: mockId,
        title: 'Original Title',
        content: 'Original Content that meets length requirements.',
        status: 'Draft',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.update.mockResolvedValue({
        ...mockDoc,
        title: 'Updated Title',
      });

      const result = await service.update(adminActor, mockId.toString(), {
        title: 'Updated Title',
      });

      expect(result.title).toBe('Updated Title');
      expect(mockRepository.update).toHaveBeenCalledWith(mockId.toString(), {
        title: 'Updated Title',
      });
    });

    it('rejects update if broadcast is already Sent (BR-BCN-13)', async () => {
      const mockId = new Types.ObjectId();
      const mockDoc = {
        _id: mockId,
        title: 'Sent Announcement',
        status: 'Sent',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);

      await expect(
        service.update(adminActor, mockId.toString(), {
          title: 'Attempted Change',
        }),
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST,
        message: BROADCAST_MESSAGES.ALREADY_SENT_CANNOT_EDIT,
      });
    });
  });

  describe('UC-06: Delete a broadcast notification', () => {
    it('hard deletes a draft or scheduled notification', async () => {
      const mockId = new Types.ObjectId();
      const mockDoc = {
        _id: mockId,
        title: 'Draft to discard',
        status: 'Draft',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.deleteOrArchive.mockResolvedValue(true);

      const result = await service.delete(adminActor, mockId.toString());

      expect(mockRepository.deleteOrArchive).toHaveBeenCalledWith(mockId.toString(), true);
      expect(result.success).toBe(true);
      expect(result.message).toBe(BROADCAST_MESSAGES.DELETED);
    });

    it('archives a dispatched notification by marking deleted_at', async () => {
      const mockId = new Types.ObjectId();
      const mockDoc = {
        _id: mockId,
        title: 'Sent record to archive',
        status: 'Sent',
      };

      mockRepository.findById.mockResolvedValue(mockDoc);
      mockRepository.deleteOrArchive.mockResolvedValue(true);

      const result = await service.delete(adminActor, mockId.toString());

      expect(mockRepository.deleteOrArchive).toHaveBeenCalledWith(mockId.toString(), false);
      expect(result.success).toBe(true);
    });
  });

  describe('Background Scheduler & Dispatch Now', () => {
    it('processes due scheduled broadcasts atomically with CAS claim', async () => {
      const mockId = new Types.ObjectId();
      const targetUser = new Types.ObjectId();
      const mockDueBroadcast = {
        _id: mockId,
        title: 'Scheduled maintenance triggered by cron',
        content: 'System is updating right now.',
        category: 'System Maintenance',
        target_audience: 'All Users',
        priority: 'Normal',
        status: 'Scheduled',
        scheduled_at: new Date(Date.now() - 1000),
      };

      mockRepository.findDueScheduled.mockResolvedValue([mockDueBroadcast]);
      mockRepository.claimForDispatch.mockResolvedValue(mockDueBroadcast);
      mockRepository.getTargetUserIds.mockResolvedValue([targetUser]);
      mockRepository.update.mockResolvedValue({
        ...mockDueBroadcast,
        status: 'Sent',
      });

      const dispatchedCount = await service.processDueScheduledBroadcasts();

      expect(dispatchedCount).toBe(1);
      expect(mockRepository.claimForDispatch).toHaveBeenCalledWith(mockId.toString(), ['Scheduled']);
      expect(mockBus.emitNotification).toHaveBeenCalledTimes(1);
    });

    it('dispatchNow atomically claims broadcast before dispatching', async () => {
      const mockId = new Types.ObjectId();
      const targetUser = new Types.ObjectId();
      const mockDraft = {
        _id: mockId,
        title: 'Instant Flash Dispatch',
        content: 'Testing instant dispatch with atomic CAS claim.',
        category: 'Event Announcement',
        target_audience: 'All Users',
        priority: 'High',
        status: 'Draft',
      };

      mockRepository.claimForDispatch.mockResolvedValue(mockDraft);
      mockRepository.getTargetUserIds.mockResolvedValue([targetUser]);
      mockRepository.update.mockResolvedValue({ ...mockDraft, status: 'Sent' });
      mockRepository.findById.mockResolvedValue({ ...mockDraft, status: 'Sent' });

      const result = await service.dispatchNow(adminActor, mockId.toString());

      expect(mockRepository.claimForDispatch).toHaveBeenCalledWith(mockId.toString(), ['Draft', 'Scheduled']);
      expect(result.status).toBe('Sent');
    });
  });
});
