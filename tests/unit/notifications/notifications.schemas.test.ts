import { describe, expect, it } from 'vitest';

import {
  createNotificationInputSchema,
  markAllReadQuerySchema,
  markAllReadResponseSchema,
  notificationIdParamSchema,
  notificationListQuerySchema,
  registerDeviceTokenBodySchema,
} from '../../../src/modules/notifications/notifications.schemas.js';

describe('Notifications schemas', () => {
  describe('notificationIdParamSchema', () => {
    it('accepts valid 24-character hexadecimal ObjectId', () => {
      const result = notificationIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
      expect(result.success).toBe(true);
    });

    it('rejects malformed id format', () => {
      const result = notificationIdParamSchema.safeParse({ id: 'invalid-id' });
      expect(result.success).toBe(false);
    });

    it('rejects unknown properties due to strictObject', () => {
      const result = notificationIdParamSchema.safeParse({
        id: '507f1f77bcf86cd799439011',
        extra: 'not-allowed',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('notificationListQuerySchema', () => {
    it('applies default pagination values', () => {
      const result = notificationListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.isRead).toBeUndefined();
      }
    });

    it('coerces string isRead to boolean', () => {
      const trueResult = notificationListQuerySchema.safeParse({ isRead: 'true' });
      expect(trueResult.success).toBe(true);
      if (trueResult.success) expect(trueResult.data.isRead).toBe(true);

      const falseResult = notificationListQuerySchema.safeParse({ isRead: 'false' });
      expect(falseResult.success).toBe(true);
      if (falseResult.success) expect(falseResult.data.isRead).toBe(false);
    });

    it('validates supported notification type filter', () => {
      const valid = notificationListQuerySchema.safeParse({ type: 'interview_scheduled' });
      expect(valid.success).toBe(true);

      const invalid = notificationListQuerySchema.safeParse({ type: 'unknown_type' as never });
      expect(invalid.success).toBe(false);
    });
  });

  describe('createNotificationInputSchema', () => {
    it('validates complete notification input', () => {
      const result = createNotificationInputSchema.safeParse({
        recipientId: '507f1f77bcf86cd799439011',
        title: 'Interview Rescheduled',
        message: 'Your interview has been moved to Friday at 2:00 PM.',
        type: 'interview_rescheduled',
        category: 'action_required',
        actionUrl: '/interviews/123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty title or message', () => {
      const result = createNotificationInputSchema.safeParse({
        recipientId: '507f1f77bcf86cd799439011',
        title: '',
        message: '',
        type: 'account_alert',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('registerDeviceTokenBodySchema', () => {
    it('accepts valid platform and token', () => {
      const result = registerDeviceTokenBodySchema.safeParse({
        token: 'sample-token-value',
        platform: 'ios',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid platform', () => {
      const result = registerDeviceTokenBodySchema.safeParse({
        token: 'sample-token-value',
        platform: 'windows' as never,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('markAllReadQuerySchema', () => {
    it('accepts empty query object', () => {
      const result = markAllReadQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts valid ISO 8601 datetime before cutoff', () => {
      const result = markAllReadQuerySchema.safeParse({ before: '2026-10-24T10:00:00.000Z' });
      expect(result.success).toBe(true);
    });

    it('rejects malformed datetime string', () => {
      const result = markAllReadQuerySchema.safeParse({ before: 'not-a-datetime' });
      expect(result.success).toBe(false);
    });

    it('rejects unexpected properties', () => {
      const result = markAllReadQuerySchema.safeParse({ unexpected: 'value' });
      expect(result.success).toBe(false);
    });
  });

  describe('markAllReadResponseSchema', () => {
    it('accepts non-zero remaining unreadCount', () => {
      const result = markAllReadResponseSchema.safeParse({
        updatedCount: 3,
        unreadCount: 2,
        message: 'All notifications marked as read',
      });
      expect(result.success).toBe(true);
    });
  });
});
