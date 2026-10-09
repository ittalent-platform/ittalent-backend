import { describe, expect, it } from 'vitest';
import { interviewResponseBodySchema } from '../../../src/modules/interviews/interviews.schemas.js';

describe('Interview response schema', () => {
  it('accepts accept and decline responses', () => {
    expect(
      interviewResponseBodySchema.safeParse({ response: 'accepted' }).success,
    ).toBe(true);
    expect(
      interviewResponseBodySchema.safeParse({
        response: 'declined',
        reason: 'Unavailable',
      }).success,
    ).toBe(true);
  });

  it('requires a future time and reason for rescheduling', () => {
    expect(
      interviewResponseBodySchema.safeParse({
        response: 'reschedule_requested',
      }).success,
    ).toBe(false);
    expect(
      interviewResponseBodySchema.safeParse({
        response: 'reschedule_requested',
        reason: 'Conflict',
        proposedDateTime: '2099-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
