import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { JobPostingStatus } from '../../models/job-posting.model.js';

export const jobPostings = sqliteTable(
  'job_postings',
  {
    id: text('id', { length: 24 }).primaryKey(),
    enterprise_id: text('enterprise_id', { length: 24 }).notNull(),
    posted_by_user_id: text('posted_by_user_id', { length: 24 }).notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    location: text('location'),
    employment_type: text('employment_type'),
    salary_min: integer('salary_min'),
    salary_max: integer('salary_max'),
    salary_negotiable: integer('salary_negotiable', { mode: 'boolean' }).default(false).notNull(),
    currency: text('currency').default('VND').notNull(),
    level: text('level'),
    description: text('description'),
    requirements: text('requirements'),
    benefits: text('benefits'),
    openings: integer('openings'),
    status: text('status').$type<JobPostingStatus>().default('draft').notNull(),
    published_at: integer('published_at', { mode: 'timestamp_ms' }),
    closed_at: integer('closed_at', { mode: 'timestamp_ms' }),
    archived_at: integer('archived_at', { mode: 'timestamp_ms' }),
    expires_at: integer('expires_at', { mode: 'timestamp_ms' }),
    deleting: integer('deleting', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex('job_postings_slug_idx').on(table.slug),
    index('job_postings_enterprise_idx').on(table.enterprise_id),
    index('job_postings_status_idx').on(table.status),
  ],
);

export const jobPostingAudits = sqliteTable(
  'job_posting_audits',
  {
    id: text('id', { length: 24 }).primaryKey(),
    job_posting_id: text('job_posting_id', { length: 24 }).notNull(),
    actor_user_id: text('actor_user_id', { length: 24 }).notNull(),
    action: text('action').notNull(),
    changes: text('changes', { mode: 'json' }).$type<Record<string, unknown>>(),
    occurred_at: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('job_audits_posting_idx').on(table.job_posting_id, table.occurred_at),
  ],
);
