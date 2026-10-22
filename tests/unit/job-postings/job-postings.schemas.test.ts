import { describe, expect, it } from 'vitest';

import { jobPostingIdParamSchema, jobPostingPublicParamSchema } from '../../../src/modules/job-postings/job-postings.schemas.js';

describe('jobPostingPublicParamSchema', () => {
  it.each(['507f1f77bcf86cd799439011', 'seed-job-500', 'backend-engineer', 'platform-engineer-2'])('accepts %s', (id) => {
    expect(jobPostingPublicParamSchema.safeParse({ id }).success).toBe(true);
  });

  it.each(['', 'Not An Id', 'UPPER-case', '../etc/passwd', '-leading', 'double--dash', `${'a'.repeat(201)}`])('rejects %j', (id) => {
    expect(jobPostingPublicParamSchema.safeParse({ id }).success).toBe(false);
  });

  it('leaves the management routes id-only', () => {
    expect(jobPostingIdParamSchema.safeParse({ id: 'seed-job-500' }).success).toBe(false);
    expect(jobPostingIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' }).success).toBe(true);
  });
});
