import { describe, expect, it } from 'vitest';
import {
  broadcastIdParamSchema,
  broadcastListQuerySchema,
  createBroadcastNotificationSchema,
  scheduleBroadcastNotificationSchema,
} from '../../../src/modules/broadcast-notifications/broadcast-notifications.schemas.js';

describe('Broadcast Notifications Schemas Validation', () => {
  describe('createBroadcastNotificationSchema', () => {
    it('accepts valid creation payload', () => {
      const payload = {
        title: 'System Maintenance Window',
        content: 'The platform will be down for scheduled upgrades on Saturday night.',
        category: 'System Maintenance',
        target_audience: 'All Users',
        priority: 'High',
        action_url: 'https://status.italent.com',
        action_label: 'Status Page',
        channels: ['In-App Inbox'],
        is_draft: false,
      };

      const result = createBroadcastNotificationSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects title shorter than 5 characters', () => {
      const payload = {
        title: 'Down',
        content: 'System is temporarily unavailable.',
        category: 'System Maintenance',
        target_audience: 'All Users',
      };

      const result = createBroadcastNotificationSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Title must be at least 5 characters');
      }
    });

    it('rejects content shorter than 10 characters', () => {
      const payload = {
        title: 'Valid Title Here',
        content: 'Too short',
        category: 'Feature Update',
        target_audience: 'Applicants only',
      };

      const result = createBroadcastNotificationSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Content must be at least 10 characters');
      }
    });

    it('rejects invalid action URL format', () => {
      const payload = {
        title: 'Valid Announcement Title',
        content: 'Detailed description about new features released this week.',
        category: 'Feature Update',
        target_audience: 'Recruiters only',
        action_url: 'not-a-valid-url',
      };

      const result = createBroadcastNotificationSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Invalid action URL format');
      }
    });

    it('rejects empty channels array', () => {
      const payload = {
        title: 'Valid Announcement Title',
        content: 'Detailed description about new features released this week.',
        category: 'Feature Update',
        target_audience: 'Recruiters only',
        channels: [],
      };

      const result = createBroadcastNotificationSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('At least one channel must be selected');
      }
    });
  });

  describe('scheduleBroadcastNotificationSchema', () => {
    it('accepts future timestamp >= 15 minutes ahead', () => {
      const future = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const result = scheduleBroadcastNotificationSchema.safeParse({
        scheduled_at: future,
        timezone: 'Asia/Ho_Chi_Minh',
      });
      expect(result.success).toBe(true);
    });

    it('rejects timestamp less than 15 minutes ahead', () => {
      const tooSoon = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const result = scheduleBroadcastNotificationSchema.safeParse({
        scheduled_at: tooSoon,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Scheduled time must be at least 15 minutes in the future');
      }
    });

    it('rejects past timestamp', () => {
      const past = new Date(Date.now() - 60000).toISOString();
      const result = scheduleBroadcastNotificationSchema.safeParse({
        scheduled_at: past,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Scheduled time must be at least 15 minutes in the future');
      }
    });
  });

  describe('broadcastListQuerySchema', () => {
    it('accepts valid query parameters and sets defaults', () => {
      const result = broadcastListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
        expect(result.data.sortBy).toBe('createdAt');
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('rejects invalid date range where fromDate is after toDate', () => {
      const result = broadcastListQuerySchema.safeParse({
        fromDate: '2026-10-25',
        toDate: '2026-10-20',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Start date cannot be after end date');
      }
    });
  });

  describe('broadcastIdParamSchema', () => {
    it('accepts 24-char hex ObjectId', () => {
      const result = broadcastIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
      expect(result.success).toBe(true);
    });

    it('rejects non-hex string', () => {
      const result = broadcastIdParamSchema.safeParse({ id: 'invalid-id-format' });
      expect(result.success).toBe(false);
    });
  });
});
