import { describe, expect, it } from 'vitest';

import { updateUserBodySchema, updateUserStatusBodySchema, userListQuerySchema } from '../../../src/modules/users/users.schemas.js';

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
      role: 'admin',
      status: 'active',
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
    expect(userListQuerySchema.parse({ role: 'enterprise_admin' }).role).toBe(
      'enterprise_admin',
    );
  });
});

describe('updateUserBodySchema', () => {
  it('accepts the editable fields and normalizes the phone number', () => {
    expect(updateUserBodySchema.parse({ fullName: '  Mai Dương ', phone: '0901 234 567', role: 'admin' })).toEqual({ fullName: 'Mai Dương', phone: '0901234567', role: 'admin' });
  });

  it('allows null to clear a phone number', () => {
    expect(updateUserBodySchema.parse({ phone: null })).toEqual({ phone: null });
  });

  it('strictly rejects status and statusReason to prevent status mutation bypass (UC-11 vs UC-12)', () => {
    expect(updateUserBodySchema.safeParse({ status: 'suspended' }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ statusReason: 'policy violation' }).success).toBe(false);
    expect(updateUserBodySchema.safeParse({ fullName: 'Valid Name', status: 'active' }).success).toBe(false);
  });
});

describe('updateUserStatusBodySchema (UC-12)', () => {
  it('requires a non-empty reason when suspending an account (BR-EMP-13)', () => {
    const missingReason = updateUserStatusBodySchema.safeParse({ status: 'suspended' });
    expect(missingReason.success).toBe(false);
    if (!missingReason.success) {
      expect(missingReason.error.issues[0]?.message).toBe(
        'A justification reason is required when suspending an account',
      );
    }

    const emptyReason = updateUserStatusBodySchema.safeParse({ status: 'suspended', reason: '   ' });
    expect(emptyReason.success).toBe(false);

    const validSuspension = updateUserStatusBodySchema.safeParse({
      status: 'suspended',
      reason: 'Contract terminated by HR',
    });
    expect(validSuspension.success).toBe(true);
  });

  it('allows reason to be omitted when activating or setting inactive', () => {
    expect(updateUserStatusBodySchema.safeParse({ status: 'active' }).success).toBe(true);
    expect(updateUserStatusBodySchema.safeParse({ status: 'inactive' }).success).toBe(true);
  });
});
