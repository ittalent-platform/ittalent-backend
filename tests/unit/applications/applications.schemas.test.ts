import { describe, expect, it } from 'vitest';

import {
  applicationHistoryQuerySchema,
  applicationListQuerySchema,
  applicationListQueryValidator,
  applicationIdParamSchema,
  parseStatusFilter,
  withdrawApplicationBodySchema,
} from '../../../src/modules/applications/applications.schemas.js';

describe('Applications schemas', () => {
  describe('applicationIdParamSchema', () => {
    it('accepts valid 24-hex string', () => {
      expect(applicationIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' }).success).toBe(true);
    });

    it('rejects invalid hex string', () => {
      expect(applicationIdParamSchema.safeParse({ id: 'notanid' }).success).toBe(false);
    });

    it('rejects wrong length', () => {
      expect(
        applicationIdParamSchema.safeParse({ id: '507f1f77bcf86cd79943901' }).success,
      ).toBe(false);
    });
  });

  describe('applicationListQuerySchema', () => {
    it('applies pagination defaults', () => {
      expect(applicationListQuerySchema.parse({})).toEqual({
        sortBy: 'submittedAt',
        sortOrder: 'desc',
        page: 1,
        limit: 20,
      });
    });

    it('accepts all optional filters', () => {
      const input = {
        status: 'submitted',
        jobId: '507f1f77bcf86cd799439011',
        reviewStage: 'screening',
        search: 'engineer',
        submittedFrom: '2026-01-01T00:00:00.000Z',
        submittedTo: '2026-12-31T23:59:59.000Z',
      };
      const parsed = applicationListQuerySchema.parse(input);
      expect(parsed.status).toBe('submitted');
      expect(parsed.jobId).toBe('507f1f77bcf86cd799439011');
      expect(parsed.reviewStage).toBe('screening');
      expect(parsed.search).toBe('engineer');
      expect(parsed.submittedFrom).toEqual(new Date('2026-01-01T00:00:00.000Z'));
      expect(parsed.submittedTo).toEqual(new Date('2026-12-31T23:59:59.000Z'));
    });

    it('rejects unknown query keys (strict object)', () => {
      expect(
        applicationListQuerySchema.safeParse({ page: 1, unknown: 'value' }).success,
      ).toBe(false);
    });

    it('applies search keyword bounds', () => {
      expect(
        applicationListQuerySchema.safeParse({
          search: 'a'.repeat(101),
        }).success,
      ).toBe(false);
      expect(
        applicationListQuerySchema.safeParse({
          search: '',
        }).success,
      ).toBe(false);
    });
  });

  describe('applicationListQueryValidator', () => {
    it('passes when submittedFrom before submittedTo', () => {
      expect(
        applicationListQueryValidator.safeParse({
          submittedFrom: '2026-01-01T00:00:00.000Z',
          submittedTo: '2026-12-31T23:59:59.000Z',
        }).success,
      ).toBe(true);
    });

    it('fails when submittedAfter submittedTo', () => {
      expect(
        applicationListQueryValidator.safeParse({
          submittedFrom: '2026-12-31T23:59:59.000Z',
          submittedTo: '2026-01-01T00:00:00.000Z',
        }).success,
      ).toBe(false);
    });

    it('passes when either date is missing', () => {
      expect(
        applicationListQueryValidator.safeParse({
          submittedFrom: '2026-01-01T00:00:00.000Z',
        }).success,
      ).toBe(true);
      expect(
        applicationListQueryValidator.safeParse({
          submittedTo: '2026-01-01T00:00:00.000Z',
        }).success,
      ).toBe(true);
    });
  });

  describe('withdrawApplicationBodySchema', () => {
    it('requires expectedVersion', () => {
      expect(
        withdrawApplicationBodySchema.safeParse({}).success,
      ).toBe(false);
    });

    it('accepts valid expectedVersion', () => {
      expect(
        withdrawApplicationBodySchema.safeParse({ expectedVersion: 0 }).success,
      ).toBe(true);
    });

    it('rejects negative expectedVersion', () => {
      expect(
        withdrawApplicationBodySchema.safeParse({ expectedVersion: -1 }).success,
      ).toBe(false);
    });

    it('accepts optional reason up to max length', () => {
      expect(
        withdrawApplicationBodySchema.safeParse({
          expectedVersion: 0,
          reason: 'a'.repeat(500),
        }).success,
      ).toBe(true);
    });

    it('rejects reason over max length', () => {
      expect(
        withdrawApplicationBodySchema.safeParse({
          expectedVersion: 0,
          reason: 'a'.repeat(501),
        }).success,
      ).toBe(false);
    });
  });

  describe('applicationHistoryQuerySchema', () => {
    it('applies pagination defaults', () => {
      expect(applicationHistoryQuerySchema.parse({})).toEqual({
        page: 1,
        limit: 20,
      });
    });

    it('respects history max limit', () => {
      expect(
        applicationHistoryQuerySchema.safeParse({ limit: 101 }).success,
      ).toBe(false);
    });
  });

  // UC-MYAPP-05.EX.3 / AC-MYAPP-05-05: the eight supported statuses, alone or as a comma-separated list.
  describe('status filter', () => {
    it.each(['submitted', 'position_filled', 'submitted,under_review', 'hired,rejected,withdrawn,position_filled'])('accepts %s', (status) => {
      expect(applicationListQuerySchema.safeParse({ status }).success).toBe(true);
    });

    it.each(['unknown', 'submitted,unknown', 'submitted,', ',', 'Submitted'])('rejects %s', (status) => {
      expect(applicationListQuerySchema.safeParse({ status }).success).toBe(false);
    });

    it('splits a list into statuses', () => {
      expect(parseStatusFilter('submitted, under_review')).toEqual(['submitted', 'under_review']);
    });
  });

  // UC-MYAPP-01.EX.3: invalid sort input is rejected before any query runs.
  describe('sort parameters', () => {
    it('defaults to newest submitted first', () => {
      const parsed = applicationListQuerySchema.parse({});
      expect(parsed.sortBy).toBe('submittedAt');
      expect(parsed.sortOrder).toBe('desc');
    });

    it.each(['submittedAt', 'latestStatusAt', 'id'])('accepts sortBy=%s', (sortBy) => {
      expect(applicationListQuerySchema.safeParse({ sortBy, sortOrder: 'asc' }).success).toBe(true);
    });

    it('rejects unsupported sort fields and orders', () => {
      expect(applicationListQuerySchema.safeParse({ sortBy: 'company' }).success).toBe(false);
      expect(applicationListQuerySchema.safeParse({ sortOrder: 'sideways' }).success).toBe(false);
    });
  });

  // UC-MYAPP-05.EX.2 / AC-MYAPP-05-04: keyword must be non-empty after trim and at most 100 characters.
  describe('keyword validation', () => {
    it('rejects a whitespace-only keyword', () => {
      expect(applicationListQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
    });

    it('rejects a keyword over 100 characters', () => {
      expect(applicationListQuerySchema.safeParse({ search: 'x'.repeat(101) }).success).toBe(false);
    });
  });
});
