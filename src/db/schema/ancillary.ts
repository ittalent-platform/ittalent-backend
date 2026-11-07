import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { ReportEvidenceFile, ReportStatus, ReportStatusHistoryEntry, ReportTargetSnapshot, ReportTimelineEvent } from '../../models/report.model.js';

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
    is_read: integer('is_read', { mode: 'boolean' }).default(false).notNull(),
    read_at: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('notifications_user_idx').on(table.user_id, table.createdAt),
  ],
);

export const deviceTokens = sqliteTable(
  'device_tokens',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    token: text('token').notNull(),
    platform: text('platform', { enum: ['web', 'ios', 'android'] }).notNull(),
    last_seen_at: integer('last_seen_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('device_tokens_user_idx').on(table.user_id),
  ],
);

export const broadcastNotifications = sqliteTable(
  'broadcast_notifications',
  {
    id: text('id', { length: 24 }).primaryKey(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
    scheduled_for: integer('scheduled_for', { mode: 'timestamp_ms' }),
    sent_at: integer('sent_at', { mode: 'timestamp_ms' }),
    status: text('status', { enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] }).default('draft').notNull(),
    created_by: text('created_by', { length: 24 }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('broadcast_status_idx').on(table.status),
  ],
);

export const reports = sqliteTable(
  'reports',
  {
    id: text('id', { length: 24 }).primaryKey(),
    reporter_id: text('reporter_id', { length: 24 }).notNull(),
    target_type: text('target_type', { enum: ['job_posting', 'enterprise', 'user'] }).notNull(),
    target_id: text('target_id', { length: 24 }).notNull(),
    reason: text('reason').notNull(),
    description: text('description').notNull(),
    evidence_files: text('evidence_files', { mode: 'json' }).$type<ReportEvidenceFile[]>().default([]).notNull(),
    status: text('status').$type<ReportStatus>().default('pending').notNull(),
    resolution_notes: text('resolution_notes'),
    resolved_by: text('resolved_by', { length: 24 }),
    resolved_at: integer('resolved_at', { mode: 'timestamp_ms' }),
    status_history: text('status_history', { mode: 'json' }).$type<ReportStatusHistoryEntry[]>().default([]).notNull(),
    target_snapshot: text('target_snapshot', { mode: 'json' }).$type<ReportTargetSnapshot>(),
    timeline: text('timeline', { mode: 'json' }).$type<ReportTimelineEvent[]>().default([]).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('reports_target_idx').on(table.target_type, table.target_id),
    index('reports_status_idx').on(table.status),
  ],
);

export const certificateLinks = sqliteTable(
  'certificate_links',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    issuer: text('issuer'),
    issued_date: text('issued_date'),
    expiry_date: text('expiry_date'),
    version: integer('version').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('cert_links_user_idx').on(table.user_id),
  ],
);

export const portfolioLinks = sqliteTable(
  'portfolio_links',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    description: text('description'),
    version: integer('version').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('portfolio_links_user_idx').on(table.user_id),
  ],
);
