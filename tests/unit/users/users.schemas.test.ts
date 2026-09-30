import { describe, expect, it } from 'vitest';

import { userListQuerySchema } from '../../../src/modules/users/users.schemas.js';

describe('userListQuerySchema (UC-USER-01)', () => {
  it('applies the shared pagination defaults', () => {
    expect(userListQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query-string numbers and trims the search text', () => {
    expect(userListQuerySchema.parse({ page: '2', limit: '50', search: '  Alice  ', role: 'admin', status: 'active' })).toEqual({
      page: 2,
      limit: 50,
      search: 'Alice',
      role: 'admin',
      status: 'active',
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
    ['unsupported key (sort is fixed)', { sortBy: 'email' }],
  ])('rejects %s', (_label, query) => {
    expect(userListQuerySchema.safeParse(query).success).toBe(false);
  });

  it('accepts a search of exactly 100 characters', () => {
    expect(userListQuerySchema.safeParse({ search: 'a'.repeat(100) }).success).toBe(true);
  });
});
