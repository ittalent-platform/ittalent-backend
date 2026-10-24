import { describe, expect, it } from 'vitest';

import { updateMyProfileSchema } from '../../../src/modules/my-profile/my-profile.schemas.js';

describe('updateMyProfileSchema', () => {
  it('requires expectedVersion for every update', () => {
    const result = updateMyProfileSchema.safeParse({ fullName: 'Candidate Name' });
    expect(result.success).toBe(false);
  });

  it('normalizes allowed values and rejects forbidden fields', () => {
    const accepted = updateMyProfileSchema.safeParse({
      fullName: '  Candidate Name  ',
      phone: '090 123 4567',
      expectedVersion: 0,
    });
    expect(accepted.success).toBe(true);
    if (accepted.success) {
      expect(accepted.data).toEqual({
        fullName: 'Candidate Name',
        phone: '0901234567',
        expectedVersion: 0,
      });
    }

    expect(updateMyProfileSchema.safeParse({
      fullName: 'Candidate Name',
      expectedVersion: 0,
      role: 'admin',
    }).success).toBe(false);
  });
});
