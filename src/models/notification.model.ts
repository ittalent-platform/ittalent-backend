import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const notificationTypes = [
  'application_submitted',
  'application_status_changed',
  'interview_scheduled',
  'interview_rescheduled',
  'interview_cancelled',
  'enterprise_status_changed',
  'account_alert',
  'system_announcement',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

export const notificationCategories = ['info', 'success', 'warning', 'action_required'] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export interface NotificationData {
  recipient_id: Types.ObjectId;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  action_url?: string | null;
  data?: Record<string, unknown> | null;
  is_read: boolean;
  read_at?: Date | null;
  deleted_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const notificationSchema = new Schema<NotificationData>(
  {
    recipient_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: notificationTypes, required: true },
    category: { type: String, enum: notificationCategories, default: 'info' },
    action_url: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: null },
    is_read: { type: Boolean, default: false, index: true },
    read_at: { type: Date, default: null },
    deleted_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    collection: 'notifications',
  },
);

notificationSchema.index({ recipient_id: 1, deleted_at: 1, createdAt: -1 });
notificationSchema.index({ recipient_id: 1, deleted_at: 1, is_read: 1 });
notificationSchema.index({ 'data.broadcast_id': 1, is_read: 1 });

export const Notification = model<NotificationData>('Notification', notificationSchema);
