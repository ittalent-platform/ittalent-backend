import type { Types } from 'mongoose';
import { Schema, model } from 'mongoose';

export const broadcastCategories = [
  'System Maintenance',
  'Feature Update',
  'Policy Update',
  'Event Announcement',
  'Security Alert',
] as const;
export type BroadcastCategory = (typeof broadcastCategories)[number];

export const broadcastAudiences = [
  'All Users',
  'Applicants only',
  'Recruiters only',
  'Enterprise Admins',
] as const;
export type BroadcastAudience = (typeof broadcastAudiences)[number];

export const broadcastPriorities = ['Low', 'Normal', 'High', 'Urgent'] as const;
export type BroadcastPriority = (typeof broadcastPriorities)[number];

export const broadcastStatuses = ['Draft', 'Scheduled', 'Sent', 'Cancelled'] as const;
export type BroadcastStatus = (typeof broadcastStatuses)[number];

export const broadcastChannels = ['In-App Inbox', 'Email Digest'] as const;
export type BroadcastChannel = (typeof broadcastChannels)[number];

export interface BroadcastDeliveryMetrics {
  targeted_count: number;
  delivered_count: number;
  read_count: number;
}

export interface BroadcastNotificationData {
  title: string;
  content: string;
  category: BroadcastCategory;
  target_audience: BroadcastAudience;
  priority: BroadcastPriority;
  action_url?: string | null;
  action_label?: string | null;
  channels: BroadcastChannel[];
  status: BroadcastStatus;
  scheduled_at?: Date | null;
  sent_at?: Date | null;
  sender_id: Types.ObjectId;
  delivery_metrics: BroadcastDeliveryMetrics;
  deleted_at?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const broadcastNotificationSchema = new Schema<BroadcastNotificationData>(
  {
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 150 },
    content: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    category: { type: String, enum: broadcastCategories, required: true },
    target_audience: { type: String, enum: broadcastAudiences, required: true },
    priority: { type: String, enum: broadcastPriorities, default: 'Normal' },
    action_url: { type: String, default: null, trim: true, maxlength: 2048 },
    action_label: { type: String, default: null, trim: true, maxlength: 50 },
    channels: {
      type: [{ type: String, enum: broadcastChannels }],
      default: ['In-App Inbox'],
      required: true,
    },
    status: { type: String, enum: broadcastStatuses, default: 'Draft', index: true },
    scheduled_at: { type: Date, default: null, index: true },
    sent_at: { type: Date, default: null },
    sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    delivery_metrics: {
      targeted_count: { type: Number, default: 0 },
      delivered_count: { type: Number, default: 0 },
      read_count: { type: Number, default: 0 },
    },
    deleted_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    collection: 'broadcast_notifications',
  },
);

broadcastNotificationSchema.index({ deleted_at: 1, createdAt: -1 });
broadcastNotificationSchema.index({ deleted_at: 1, status: 1, target_audience: 1, priority: 1 });
broadcastNotificationSchema.index({ status: 1, scheduled_at: 1 });

export const BroadcastNotification = model<BroadcastNotificationData>(
  'BroadcastNotification',
  broadcastNotificationSchema,
);
