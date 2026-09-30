import { describe, expect, it } from 'vitest';

import { updateUserBodySchema, userListQuerySchema } from '../../../src/modules/users/users.schemas.js';

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
});

describe('updateUserBodySchema (UC-USER-03)', () => {
  it('accepts the editable fields and trims the name', () => {
    expect(updateUserBodySchema.parse({ fullName: '  Mai Dương  ', phone: '0901122334', role: 'admin' })).toEqual({
      fullName: 'Mai Dương',
      phone: '0901122334',
      role: 'admin',
    });
  });

  it.each([
    ['0901 234 567', '0901234567'],
    ['(090) 123-4567', '0901234567'],
    ['+84 901 234 567', '+84901234567'],
    ['090.123.4567', '0901234567'],
  ])('normalises the mobile number %s', (input, stored) => {
    expect(updateUserBodySchema.parse({ phone: input }).phone).toBe(stored);
  });

  it.each([[null], ['']])('clears the number when it is %j', (input) => {
    expect(updateUserBodySchema.parse({ phone: input }).phone).toBeNull();
  });

  it.each([
    ['a number that is too short', { phone: '12345' }],
    ['a number with letters', { phone: '09011abc34' }],
    ['a number that is too long', { phone: '1'.repeat(16) }],
    ['a one-letter name', { fullName: 'A' }],
    ['a blank name', { fullName: '   ' }],
    ['a name over 100 characters', { fullName: 'a'.repeat(101) }],
    ['a null name', { fullName: null }],
    ['a role that cannot be assigned here', { role: 'recruiter' }],
    ['an empty body', {}],
    ['a field that is not editable (email)', { email: 'x@example.com' }],
    ['a field that is not editable (status)', { status: 'blocked' }],
    ['an unknown field', { emailVerified: true }],
  ])('rejects %s', (_label, body) => {
    expect(updateUserBodySchema.safeParse(body).success).toBe(false);
  });

  it('accepts names of exactly 2 and 100 characters', () => {
    expect(updateUserBodySchema.safeParse({ fullName: 'Bo' }).success).toBe(true);
    expect(updateUserBodySchema.safeParse({ fullName: 'a'.repeat(100) }).success).toBe(true);
  });
});
