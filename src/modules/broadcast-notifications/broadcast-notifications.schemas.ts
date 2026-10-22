import { z } from 'zod';
import { objectIdSchema } from '../../shared/schemas/object-id.schemas.js';
import {
  BROADCAST_AUDIENCES,
  BROADCAST_CATEGORIES,
  BROADCAST_CHANNELS,
  BROADCAST_MESSAGES,
  BROADCAST_PRIORITIES,
  BROADCAST_STATUSES,
  MIN_SCHEDULE_ADVANCE_MS,
} from './broadcast-notifications.constants.js';

export const broadcastIdParamSchema = z.strictObject({
  id: objectIdSchema('broadcast notification ID'),
});

export const deliveryMetricsSchema = z.object({
  targetedCount: z.number().int().min(0),
  deliveredCount: z.number().int().min(0),
  readCount: z.number().int().min(0),
  readPercentage: z.number().min(0).max(100),
});

export const broadcastNotificationDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  category: z.enum(BROADCAST_CATEGORIES),
  targetAudience: z.enum(BROADCAST_AUDIENCES),
  priority: z.enum(BROADCAST_PRIORITIES),
  actionUrl: z.string().nullable().optional(),
  actionLabel: z.string().nullable().optional(),
  channels: z.array(z.enum(BROADCAST_CHANNELS)),
  status: z.enum(BROADCAST_STATUSES),
  scheduledAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  sender: z
    .object({
      id: z.string(),
      email: z.string(),
      fullName: z.string().nullable().optional(),
      role: z.string().optional(),
    })
    .optional(),
  deliveryMetrics: deliveryMetricsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type BroadcastNotificationDto = z.infer<typeof broadcastNotificationDtoSchema>;

export const createBroadcastNotificationSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(150, 'Title cannot exceed 150 characters'),
  content: z
    .string()
    .trim()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content cannot exceed 2000 characters'),
  category: z.enum(BROADCAST_CATEGORIES),
  target_audience: z.enum(BROADCAST_AUDIENCES),
  priority: z.enum(BROADCAST_PRIORITIES).default('Normal'),
  action_url: z
    .string()
    .trim()
    .url('Invalid action URL format')
    .max(2048, 'Action URL cannot exceed 2048 characters')
    .nullable()
    .optional(),
  action_label: z
    .string()
    .trim()
    .min(2, 'Action label must be at least 2 characters')
    .max(50, 'Action label cannot exceed 50 characters')
    .nullable()
    .optional(),
  channels: z
    .array(z.enum(BROADCAST_CHANNELS))
    .min(1, 'At least one channel must be selected')
    .default(['In-App Inbox']),
  is_draft: z.boolean().default(false),
});

export type CreateBroadcastNotificationInput = z.infer<typeof createBroadcastNotificationSchema>;

export const updateBroadcastNotificationSchema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(5, 'Title must be at least 5 characters')
    .max(150, 'Title cannot exceed 150 characters')
    .optional(),
  content: z
    .string()
    .trim()
    .min(10, 'Content must be at least 10 characters')
    .max(2000, 'Content cannot exceed 2000 characters')
    .optional(),
  category: z.enum(BROADCAST_CATEGORIES).optional(),
  target_audience: z.enum(BROADCAST_AUDIENCES).optional(),
  priority: z.enum(BROADCAST_PRIORITIES).optional(),
  action_url: z
    .string()
    .trim()
    .url('Invalid action URL format')
    .max(2048, 'Action URL cannot exceed 2048 characters')
    .nullable()
    .optional(),
  action_label: z
    .string()
    .trim()
    .min(2, 'Action label must be at least 2 characters')
    .max(50, 'Action label cannot exceed 50 characters')
    .nullable()
    .optional(),
  channels: z
    .array(z.enum(BROADCAST_CHANNELS))
    .min(1, 'At least one channel must be selected')
    .optional(),
});

export type UpdateBroadcastNotificationInput = z.infer<typeof updateBroadcastNotificationSchema>;

export const scheduleBroadcastNotificationSchema = z
  .strictObject({
    scheduled_at: z.string().refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime());
      },
      { message: 'Invalid scheduled date and time format' },
    ),
  })
  .superRefine((data, ctx) => {
    const scheduledDate = new Date(data.scheduled_at);
    const now = Date.now();
    if (scheduledDate.getTime() < now + MIN_SCHEDULE_ADVANCE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduled_at'],
        message: BROADCAST_MESSAGES.SCHEDULE_TIME_TOO_SOON,
      });
    }
  });

export type ScheduleBroadcastNotificationInput = z.infer<typeof scheduleBroadcastNotificationSchema>;

export const broadcastListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().max(100).optional(),
    status: z.enum(['All', ...BROADCAST_STATUSES]).optional(),
    audience: z.enum(['All', ...BROADCAST_AUDIENCES]).optional(),
    priority: z.enum(['All', ...BROADCAST_PRIORITIES]).optional(),
    fromDate: z.string().optional(),
    toDate: z.string().optional(),
    sortBy: z.enum(['createdAt', 'scheduled_at', 'title', 'status']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .superRefine((data, ctx) => {
    if (data.fromDate && data.toDate) {
      const from = new Date(data.fromDate);
      const to = new Date(data.toDate);
      if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from > to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fromDate'],
          message: BROADCAST_MESSAGES.INVALID_DATE_RANGE,
        });
      }
    }
  });

export type BroadcastListQuery = z.infer<typeof broadcastListQuerySchema>;

export const broadcastListResponseSchema = z.object({
  items: z.array(broadcastNotificationDtoSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  summary: z.object({
    total: z.number().int().min(0),
    drafts: z.number().int().min(0),
    scheduled: z.number().int().min(0),
    sent: z.number().int().min(0),
  }),
});

export type BroadcastListResponse = z.infer<typeof broadcastListResponseSchema>;
