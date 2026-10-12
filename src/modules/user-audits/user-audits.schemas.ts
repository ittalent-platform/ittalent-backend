import { z } from 'zod';

import { USER_AUDIT_ACTORS, USER_AUDIT_GROUPS, USER_AUDIT_MAX_RANGE_MS, type UserAuditGroup } from './user-audits.constants.js';

import { userAuditActions } from '../../models/user-audit.model.js';
import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const userAuditHistoryQuerySchema = z.strictObject({
  ...paginationQueryShape,
  action: z.enum(userAuditActions).optional(),
  // Several groups may be selected (checkboxes in the history filter); repeated or comma-separated, like the users list filters.
  group: z.preprocess(
    (value) => (value === undefined ? undefined : (Array.isArray(value) ? value : [value]).flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean)),
    z.array(z.enum(Object.keys(USER_AUDIT_GROUPS) as [UserAuditGroup, ...UserAuditGroup[]])).min(1).max(Object.keys(USER_AUDIT_GROUPS).length).optional(),
  ),
  actor: z.enum(USER_AUDIT_ACTORS).optional(),
  // Date-only values are calendar days in ICT (UTC+7), the zone the history page shows: `from` starts the day, `to` ends it.
  from: z.preprocess((value) => (typeof value === 'string' && DATE_ONLY.test(value) ? `${value}T00:00:00.000+07:00` : value), z.coerce.date().optional()),
  to: z.preprocess((value) => (typeof value === 'string' && DATE_ONLY.test(value) ? `${value}T23:59:59.999+07:00` : value), z.coerce.date().optional()),
}).superRefine((query, ctx) => {
  if (query.from && query.to && query.to < query.from) ctx.addIssue({ code: 'custom', path: ['to'], message: "'To' must be on or after 'From'" });
  else if (query.from && query.to && query.to.getTime() - query.from.getTime() > USER_AUDIT_MAX_RANGE_MS) ctx.addIssue({ code: 'custom', path: ['to'], message: 'Date range cannot exceed 12 months' });
});

export const userAuditItemSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorName: z.string().nullable().optional(),
  action: z.string(),
  result: z.literal('success'),
  reason: z.string().nullable(),
  changes: z.record(z.string(), z.string().nullable()).nullable(),
  version: z.number().int(),
  occurredAt: z.string(),
});

export const userAuditHistoryResponseSchema = paginatedResponseSchema(userAuditItemSchema);
export type UserAuditHistoryQuery = z.infer<typeof userAuditHistoryQuerySchema>;
export type UserAuditItem = z.infer<typeof userAuditItemSchema>;
