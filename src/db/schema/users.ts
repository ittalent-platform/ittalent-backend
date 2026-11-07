import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { UserStatusHistoryEntry } from '../../models/user.model.js';

export const users = sqliteTable(
  'users',
  {
    id: text('id', { length: 24 }).primaryKey(),
    email: text('email').notNull(),
    username: text('username').notNull(),
    role: text('role', { enum: ['user', 'admin', 'recruiter', 'enterprise_admin', 'applicant'] }).default('user').notNull(),
    status: text('status', { enum: ['active', 'inactive', 'invited', 'suspended', 'blocked'] }).default('active').notNull(),
    full_name: text('full_name'),
    phone: text('phone'),
    avatar_url: text('avatar_url'),
    avatar_storage_key: text('avatar_storage_key'),
    email_verified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
    auth_version: integer('auth_version').default(0).notNull(),
    version: integer('version').default(0).notNull(),
    admin_lock_version: integer('admin_lock_version').default(0).notNull(),
    identity_request_version: integer('identity_request_version').default(0).notNull(),
    verification_started_at: integer('verification_started_at', { mode: 'timestamp_ms' }),
    enterprise_id: text('enterprise_id', { length: 24 }),
    status_updated_at: integer('status_updated_at', { mode: 'timestamp_ms' }),
    status_updated_by: text('status_updated_by', { length: 24 }),
    status_reason: text('status_reason'),
    status_history: text('status_history', { mode: 'json' }).$type<UserStatusHistoryEntry[]>().default([]).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
    uniqueIndex('users_username_idx').on(table.username),
    index('users_role_idx').on(table.role),
    index('users_status_idx').on(table.status),
    index('users_enterprise_id_idx').on(table.enterprise_id),
  ],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    provider: text('provider', { enum: ['local', 'google'] }).notNull(),
    provider_account_id: text('provider_account_id'),
    password_hash: text('password_hash'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.user_id),
    index('accounts_provider_idx').on(table.provider, table.provider_account_id),
  ],
);

export const tokens = sqliteTable(
  'tokens',
  {
    id: text('id', { length: 24 }).primaryKey(),
    user_id: text('user_id', { length: 24 }).notNull(),
    type: text('type', { enum: ['email_verification', 'password_reset'] }).notNull(),
    token_hash: text('token_hash').notNull(),
    status: text('status', { enum: ['pending', 'used', 'revoked'] }).default('pending').notNull(),
    expires_at: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    consumed_at: integer('consumed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('tokens_user_id_idx').on(table.user_id),
    index('tokens_hash_type_idx').on(table.token_hash, table.type),
  ],
);

export const userAudits = sqliteTable(
  'user_audits',
  {
    id: text('id', { length: 24 }).primaryKey(),
    target_user_id: text('target_user_id', { length: 24 }).notNull(),
    actor_user_id: text('actor_user_id', { length: 24 }).notNull(),
    action: text('action').notNull(),
    result: text('result').default('success').notNull(),
    reason: text('reason'),
    changes: text('changes', { mode: 'json' }).$type<Record<string, string | null>>(),
    version: integer('version').notNull(),
    occurred_at: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('user_audits_target_idx').on(table.target_user_id, table.occurred_at),
  ],
);

export const userInvitations = sqliteTable(
  'user_invitations',
  {
    id: text('id', { length: 24 }).primaryKey(),
    target_user_id: text('target_user_id', { length: 24 }).notNull(),
    invited_by: text('invited_by', { length: 24 }).notNull(),
    kind: text('kind', { enum: ['new_account', 'enterprise_membership'] }).notNull(),
    role: text('role', { enum: ['user', 'recruiter', 'enterprise_admin'] }).notNull(),
    enterprise_id: text('enterprise_id', { length: 24 }),
    token_hash: text('token_hash').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'revoked', 'cancelled', 'expired'] }).default('pending').notNull(),
    expires_at: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    accepted_at: integer('accepted_at', { mode: 'timestamp_ms' }),
    revoked_at: integer('revoked_at', { mode: 'timestamp_ms' }),
    delivery_status: text('delivery_status', { enum: ['pending', 'sent', 'failed'] }).default('pending').notNull(),
    delivery_attempts: integer('delivery_attempts').default(0).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('user_invitations_target_idx').on(table.target_user_id, table.status),
    uniqueIndex('user_invitations_token_idx').on(table.token_hash),
  ],
);

export const userEmailChanges = sqliteTable(
  'user_email_changes',
  {
    id: text('id', { length: 24 }).primaryKey(),
    target_user_id: text('target_user_id', { length: 24 }).notNull(),
    requested_by: text('requested_by', { length: 24 }).notNull(),
    current_email: text('current_email').notNull(),
    new_email: text('new_email').notNull(),
    token_hash: text('token_hash').notNull(),
    expected_version: integer('expected_version').notNull(),
    status: text('status', { enum: ['pending', 'completed', 'revoked'] }).default('pending').notNull(),
    expires_at: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    completed_at: integer('completed_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    index('user_email_changes_target_idx').on(table.target_user_id, table.status),
    uniqueIndex('user_email_changes_token_idx').on(table.token_hash),
  ],
);
