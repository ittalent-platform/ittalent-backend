import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type {
  ApplicationCertificateSnapshot,
  ApplicationNoteEntry,
  ApplicationStatus,
  ApplicationStatusHistoryEntry,
} from '../../models/application.model.js';
import type { DocumentType } from '../../models/document.model.js';
import type { InterviewMode, InterviewRescheduleRequest, InterviewStatus } from '../../models/interview.model.js';

export const applications = sqliteTable(
  'applications',
  {
    id: text('id', { length: 24 }).primaryKey(),
    job_id: text('job_id', { length: 24 }).notNull(),
    applicant_id: text('applicant_id', { length: 24 }).notNull(),
    cv_id: text('cv_id', { length: 24 }).notNull(),
    cover_letter_id: text('cover_letter_id', { length: 24 }),
    message: text('message'),
    status: text('status').$type<ApplicationStatus>().default('submitted').notNull(),
    withdrawal_reason: text('withdrawal_reason'),
    reapplied_from: text('reapplied_from', { length: 24 }),
    reapplied_as: text('reapplied_as', { length: 24 }),
    status_history: text('status_history', { mode: 'json' }).$type<ApplicationStatusHistoryEntry[]>().default([]).notNull(),
    certificates: text('certificates', { mode: 'json' }).$type<ApplicationCertificateSnapshot[]>().default([]).notNull(),
    notes: text('notes', { mode: 'json' }).$type<ApplicationNoteEntry[]>().default([]).notNull(),
    idempotency_key: text('idempotency_key'),
    request_hash: text('request_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('applications_job_applicant_idx').on(table.job_id, table.applicant_id),
    index('applications_status_idx').on(table.status),
  ],
);

export const interviews = sqliteTable(
  'interviews',
  {
    id: text('id', { length: 24 }).primaryKey(),
    application_id: text('application_id', { length: 24 }).notNull(),
    enterprise_id: text('enterprise_id', { length: 24 }).notNull(),
    recruiter_id: text('recruiter_id', { length: 24 }).notNull(),
    applicant_id: text('applicant_id', { length: 24 }).notNull(),
    title: text('title').notNull(),
    scheduled_start: integer('scheduled_start', { mode: 'timestamp_ms' }).notNull(),
    scheduled_end: integer('scheduled_end', { mode: 'timestamp_ms' }).notNull(),
    mode: text('mode').$type<InterviewMode>().notNull(),
    meeting_link: text('meeting_link'),
    location: text('location'),
    note: text('note'),
    status: text('status').$type<InterviewStatus>().default('scheduled').notNull(),
    cancellation_reason: text('cancellation_reason'),
    reschedule_request: text('reschedule_request', { mode: 'json' }).$type<InterviewRescheduleRequest>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('interviews_app_idx').on(table.application_id),
    index('interviews_recruiter_idx').on(table.recruiter_id),
    index('interviews_applicant_idx').on(table.applicant_id),
    index('interviews_status_idx').on(table.status),
  ],
);

export const documents = sqliteTable(
  'documents',
  {
    id: text('id', { length: 24 }).primaryKey(),
    owner_id: text('owner_id', { length: 24 }).notNull(),
    type: text('type').$type<DocumentType>().notNull(),
    file_url: text('file_url').notNull(),
    storage_key: text('storage_key').notNull(),
    file_name: text('file_name').notNull(),
    mime_type: text('mime_type').notNull(),
    size: integer('size').notNull(),
    is_default: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
    deleted_at: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('documents_owner_type_idx').on(table.owner_id, table.type),
  ],
);

export const wishlists = sqliteTable(
  'wishlists',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    job_id: text('job_id', { length: 24 }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex('wishlists_user_job_idx').on(table.user_id, table.job_id),
  ],
);
