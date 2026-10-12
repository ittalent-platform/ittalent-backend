import { describe, expect, it } from 'vitest';

import { cancelInvitationBodySchema, createAdminUserBodySchema } from '../../../src/modules/user-invitations/user-invitations.schemas.js';

describe('user invitation request schemas', () => {
  it('requires an enterprise for company roles and forbids a candidate enterprise', () => {
    const base = { email: 'member@example.test', username: 'member_1', fullName: 'Member One' };
    expect(createAdminUserBodySchema.safeParse({ ...base, role: 'enterprise_admin' }).success).toBe(false);
    expect(createAdminUserBodySchema.safeParse({ ...base, role: 'user', enterpriseId: '507f1f77bcf86cd799439011' }).success).toBe(false);
    expect(createAdminUserBodySchema.safeParse({ ...base, role: 'recruiter', enterpriseId: '507f1f77bcf86cd799439011' }).success).toBe(true);
  });

  it('requires a reason and expected version to cancel an invitation', () => {
    expect(cancelInvitationBodySchema.safeParse({ reason: 'Wrong recipient address', expectedVersion: 1 }).success).toBe(true);
    expect(cancelInvitationBodySchema.safeParse({ reason: 'short', expectedVersion: 1 }).success).toBe(false);
  });
});
