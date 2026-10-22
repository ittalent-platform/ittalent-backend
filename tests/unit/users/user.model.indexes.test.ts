import { describe, expect, it } from 'vitest';

import { User } from '../../../src/models/user.model.js';

describe('User model indexes', () => {
  it('indexes role and creation date together, for the accounts-per-day count of the platform overview', () => {
    const indexes = User.schema.indexes().map(([fields]) => fields);

    expect(indexes).toContainEqual({ role: 1, createdAt: -1 });
  });
});
