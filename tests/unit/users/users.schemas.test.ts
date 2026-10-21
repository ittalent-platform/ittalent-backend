import { describe, expect, it } from 'vitest';

import { updateUserBodySchema, userListQuerySchema, statusUpdateBodySchema } from '../../../src/modules/users/users.schemas.js';
import { createAdminUserBodySchema } from '../../../src/modules/user-invitations/user-invitations.schemas.js';

describe('userListQuerySchema (UC-USER-01)', () => {
  it('applies the shared pagination defaults', () => {
    expect(userListQuerySchema.parse({})).toEqual({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
  });

  it('coerces query-string numbers and trims the search text', () => {
    expect(
      userListQuerySchema.parse({
        page: '2',
        limit: '50',
        search: '  Alice  ',
        role: 'admin',
        status: 'active',
        emailVerified: 'false',
        sortBy: 'email',
        sortOrder: 'asc',
      }),
    ).toEqual({
      page: 2,
      limit: 50,
      search: 'Alice',
      role: ['admin'],
      status: ['active'],
      emailVerified: false,
      sortBy: 'email',
      sortOrder: 'asc',
    });
  });

  it.each([
    ['page below 1', { page: '0' }],
    ['non-integer page', { page: '1.5' }],
    ['limit below 1', { limit: '0' }],
    ['limit above the maximum', { limit: '101' }],
    ['blank search', { search: '   ' }],
    ['single-character search', { search: 'a' }],
    ['search longer than 100 characters', { search: 'a'.repeat(101) }],
    ['unsupported role', { role: 'owner' }],
    ['unsupported status', { status: 'deleted' }],
    ['unsupported sort column', { sortBy: 'password_hash' }],
    ['unsupported sort order', { sortOrder: 'sideways' }],
    ['non-boolean emailVerified', { emailVerified: 'yes' }],
    ['unknown key', { colour: 'red' }],
  ])('rejects %s', (_label, query) => {
    expect(userListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts a search of exactly 100 characters', () => {
    expect(userListQuerySchema.safeParse({ search: 'a'.repeat(100) }).success).toBe(true);
  });

  it('accepts enterprise_admin as a persisted and filterable role', () => {
    expect(userListQuerySchema.parse({ role: 'enterprise_admin' }).role).toEqual(['enterprise_admin']);
  });

  it('accepts repeated and comma-separated filter values, bounded to 10', () => {
    expect(userListQuerySchema.parse({ role: 'recruiter,enterprise_admin', status: ['active', 'invited'] })).toMatchObject({ role: ['recruiter', 'enterprise_admin'], status: ['active', 'invited'] });
    expect(userListQuerySchema.safeParse({ role: 'user,user,user,user,user,user,user,user,user,user,user' }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ role: 'nope' }).success).toBe(false);
  });

  it('rejects a malformed company id filter', () => {
    expect(userListQuerySchema.safeParse({ enterpriseId: 'abc' }).success).toBe(false);
  });
});

describe('createAdminUserBodySchema', () => {
  const body = { email: 'ent@example.test', username: 'enterprise_admin', fullName: 'Enterprise Administrator', role: 'enterprise_admin' };
  it('requires enterprise scope for an Enterprise Administrator', () => {
    expect(createAdminUserBodySchema.safeParse(body).success).toBe(false);
    expect(createAdminUserBodySchema.parse({ ...body, enterpriseId: '507f1f77bcf86cd799439011' })).toMatchObject({ role: 'enterprise_admin', enterpriseId: '507f1f77bcf86cd799439011' });
  });
  it('keeps Candidate unassigned and prevents System Administrator creation through this endpoint', () => {
    expect(createAdminUserBodySchema.safeParse({ ...body, role: 'user', enterpriseId: '507f1f77bcf86cd799439011' }).success).toBe(false);
    expect(createAdminUserBodySchema.safeParse({ ...body, role: 'admin' }).success).toBe(false);
  });
});

describe('updateUserBodySchema', () => {
  it('accepts the editable fields and normalizes the phone number', () => {
    expect(updateUserBodySchema.parse({ fullName: '  Mai Dương ', phone: '0901 234 567', expectedVersion: 2 })).toEqual({ fullName: 'Mai Dương', phone: '0901234567', expectedVersion: 2 });
  });

  it('accepts only Vietnamese mobile numbers: 10 digits starting with 0', () => {
    for (const bad of ['+84901234567', 'dddddddddd', '0201234567', '090123456', '09012345678']) {
      expect(updateUserBodySchema.safeParse({ phone: bad, expectedVersion: 0 }).success, bad).toBe(false);
    }
    expect(updateUserBodySchema.safeParse({ phone: '0386 123 456', expectedVersion: 0 }).success).toBe(true);
  });

  it('allows null to clear a phone number', () => {
    expect(updateUserBodySchema.parse({ phone: null, expectedVersion: 0 })).toEqual({ phone: null, expectedVersion: 0 });
  });

  it('rejects role changes through the profile patch', () => {
    expect(updateUserBodySchema.safeParse({ role: 'admin', expectedVersion: 0 }).success).toBe(false);
  });

  it('strictly rejects status and statusReason to prevent status mutation bypass (UC-11 vs UC-12)', () => {
    expect(updateUserBodySchema.safeParse({ status: 'suspended' }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ statusReason: 'policy violation' }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ fullName: 'Valid Name', status: 'active' }).success).toBe(false);
  });
});

describe('statusUpdateBodySchema (UC-12)', () => {
  it('requires status reason and expected version for audited changes', () => {
    expect(statusUpdateBodySchema.safeParse({ status: 'suspended' }).success).toBe(false);
    expect(statusUpdateBodySchema.safeParse({ status: 'suspended', reason: 'Policy review' }).success).toBe(false);
    expect(statusUpdateBodySchema.safeParse({ status: 'suspended', reason: 'Policy review', expectedVersion: 0 }).success).toBe(true);
  });
});
