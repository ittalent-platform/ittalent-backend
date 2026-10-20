import { devicePlatforms } from '../../models/device-token.model.js';
import { notificationCategories, notificationTypes } from '../../models/notification.model.js';

export { devicePlatforms, notificationCategories, notificationTypes };

export const NOTIFICATION_MESSAGES = {
  NOT_FOUND: 'Notification not found',
  DELETED: 'Notification deleted successfully',
  ALL_DELETED: 'All notifications deleted successfully',
  ALL_MARKED_READ: 'All notifications marked as read',
  MARKED_READ: 'Notification marked as read',
  NO_UPDATES_NEEDED: 'No unread notifications to mark as read',
  NO_NOTIFICATIONS_TO_DELETE: 'No notifications found to delete',
  UNAUTHORIZED: 'Authentication required to access notifications',
} as const;

export const SSE_HEARTBEAT_INTERVAL_MS = 25_000;

export const NOTIFICATION_LIMITS = {
  TITLE_MAX: 200,
  MESSAGE_MAX: 2000,
  TOKEN_MAX: 500,
} as const;
