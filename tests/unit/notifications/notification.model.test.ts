import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import {
  DeviceToken,
  devicePlatforms,
  Notification,
  notificationCategories,
  notificationTypes,
} from '../../../src/models/index.js';

describe('Notification and DeviceToken models', () => {
  describe('Notification model', () => {
    it('defines expected notification types and categories', () => {
      expect(notificationTypes).toContain('application_submitted');
      expect(notificationTypes).toContain('application_status_changed');
      expect(notificationTypes).toContain('interview_scheduled');
      expect(notificationTypes).toContain('interview_rescheduled');
      expect(notificationTypes).toContain('interview_cancelled');
      expect(notificationTypes).toContain('enterprise_status_changed');
      expect(notificationTypes).toContain('account_alert');
      expect(notificationTypes).toContain('system_announcement');

      expect(notificationCategories).toEqual(['info', 'success', 'warning', 'action_required']);
    });

    it('instantiates valid Notification document with defaults', () => {
      const recipientId = new Types.ObjectId();
      const doc = new Notification({
        recipient_id: recipientId,
        title: 'Interview Scheduled',
        message: 'Your interview has been scheduled for tomorrow at 10:00 AM.',
        type: 'interview_scheduled',
      });

      expect(doc.recipient_id).toEqual(recipientId);
      expect(doc.title).toBe('Interview Scheduled');
      expect(doc.message).toBe('Your interview has been scheduled for tomorrow at 10:00 AM.');
      expect(doc.type).toBe('interview_scheduled');
      expect(doc.category).toBe('info');
      expect(doc.is_read).toBe(false);
      expect(doc.read_at).toBeNull();
      expect(doc.deleted_at).toBeNull();
      expect(doc.action_url).toBeNull();
      expect(doc.data).toBeNull();
    });

    it('fails validation when required fields are missing', async () => {
      const doc = new Notification({});
      let error: { errors: Record<string, unknown> } | undefined;
      try {
        await doc.validate();
      } catch (err) {
        error = err as { errors: Record<string, unknown> };
      }
      expect(error).toBeDefined();
      expect(error?.errors.recipient_id).toBeDefined();
      expect(error?.errors.title).toBeDefined();
      expect(error?.errors.message).toBeDefined();
      expect(error?.errors.type).toBeDefined();
    });

    it('fails validation when invalid notification type is provided', async () => {
      const doc = new Notification({
        recipient_id: new Types.ObjectId(),
        title: 'Test',
        message: 'Test message',
        type: 'invalid_type' as never,
      });
      let error: { errors: Record<string, unknown> } | undefined;
      try {
        await doc.validate();
      } catch (err) {
        error = err as { errors: Record<string, unknown> };
      }
      expect(error).toBeDefined();
      expect(error?.errors.type).toBeDefined();
    });
  });

  describe('DeviceToken model', () => {
    it('defines expected device platforms', () => {
      expect(devicePlatforms).toEqual(['ios', 'android', 'web']);
    });

    it('instantiates valid DeviceToken document with defaults', () => {
      const userId = new Types.ObjectId();
      const doc = new DeviceToken({
        user_id: userId,
        token: 'fcm-sample-device-token',
        platform: 'android',
      });

      expect(doc.user_id).toEqual(userId);
      expect(doc.token).toBe('fcm-sample-device-token');
      expect(doc.platform).toBe('android');
      expect(doc.last_seen_at).toBeInstanceOf(Date);
    });

    it('fails validation when required fields are missing', async () => {
      const doc = new DeviceToken({});
      let error: { errors: Record<string, unknown> } | undefined;
      try {
        await doc.validate();
      } catch (err) {
        error = err as { errors: Record<string, unknown> };
      }
      expect(error).toBeDefined();
      expect(error?.errors.user_id).toBeDefined();
      expect(error?.errors.token).toBeDefined();
      expect(error?.errors.platform).toBeDefined();
    });
  });
});
