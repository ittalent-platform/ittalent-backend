import { describe, expect, it } from 'vitest';

import { userAuditHistoryQuerySchema } from '../../../src/modules/user-audits/user-audits.schemas.js';

describe('userAuditHistoryQuerySchema', () => {
  it('accepts group, actor and an ordered date range', () => {
    const parsed = userAuditHistoryQuerySchema.parse({ group: 'email', actor: 'admin', from: '2026-01-01', to: '2026-02-01' });
    expect(parsed).toMatchObject({ group: ['email'], actor: 'admin' });
  });

  it("rejects a 'to' before 'from'", () => {
    expect(userAuditHistoryQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(false);
  });

  it('rejects a range longer than 12 months', () => {
    expect(userAuditHistoryQuerySchema.safeParse({ from: '2024-01-01', to: '2026-01-01' }).success).toBe(false);
  });

  it('treats date-only from/to as whole calendar days in ICT', () => {
    const parsed = userAuditHistoryQuerySchema.parse({ from: '2026-02-01', to: '2026-02-01' });
    expect(parsed.from?.toISOString()).toBe('2026-01-31T17:00:00.000Z');
    expect(parsed.to?.toISOString()).toBe('2026-02-01T16:59:59.999Z');
  });

  it('accepts several groups, repeated or comma-separated', () => {
    expect(userAuditHistoryQuerySchema.parse({ group: 'account,email' }).group).toEqual(['account', 'email']);
    expect(userAuditHistoryQuerySchema.parse({ group: ['profile', 'email'] }).group).toEqual(['profile', 'email']);
  });

  it('rejects unknown groups', () => {
    expect(userAuditHistoryQuerySchema.safeParse({ group: 'nope' }).success).toBe(false);
  });
});
