export const BROADCAST_CATEGORIES = [
  'System Maintenance',
  'Feature Update',
  'Policy Update',
  'Event Announcement',
  'Security Alert',
] as const;

export const BROADCAST_AUDIENCES = [
  'All Users',
  'Applicants only',
  'Recruiters only',
  'Enterprise Admins',
] as const;

export const BROADCAST_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;

export const BROADCAST_STATUSES = ['Draft', 'Scheduled', 'Sent', 'Cancelled'] as const;

export const BROADCAST_CHANNELS = ['In-App Inbox', 'Email Digest'] as const;

export const MIN_SCHEDULE_ADVANCE_MS = 15 * 60 * 1000; // 15 minutes per BR-BCN-10

export const BROADCAST_MESSAGES = {
  CREATED: 'Broadcast notification created successfully',
  UPDATED: 'Broadcast notification updated successfully',
  DELETED: 'Broadcast notification deleted successfully',
  SCHEDULED: 'Broadcast notification scheduled successfully',
  SCHEDULE_CANCELLED: 'Broadcast scheduled dispatch cancelled and reverted to draft',
  DISPATCHED: 'Broadcast notification dispatched successfully',
  NOT_FOUND: 'Broadcast notification not found',
  ALREADY_SENT_CANNOT_EDIT: 'Dispatched broadcasts cannot be modified',
  ALREADY_SENT_CANNOT_SCHEDULE: 'Dispatched broadcasts cannot be rescheduled',
  SCHEDULE_TIME_TOO_SOON: 'Scheduled time must be at least 15 minutes in the future',
  INVALID_DATE_RANGE: 'Start date cannot be after end date',
  NOT_SCHEDULED: 'Broadcast notification is not in a scheduled state',
  UNAUTHORIZED_ADMIN_ONLY: 'Access Denied: Only System Administrators can manage broadcast notifications',
} as const;
