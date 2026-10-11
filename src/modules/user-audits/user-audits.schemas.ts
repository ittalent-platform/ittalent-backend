import { z } from 'zod';

import { paginatedResponseSchema, paginationQueryShape } from '../../shared/schemas/pagination.schemas.js';

export const userAuditHistoryQuerySchema = z.strictObject({
  ...paginationQueryShape,
  action: z.enum(['account_invited', 'profile_updated', 'status_suspended', 'status_reopened', 'invitation_accepted', 'email_change_requested', 'email_changed']).optional(),
});

export const userAuditItemSchema = z.object({
  id: z.string(),
  actorId: z.string(),
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
