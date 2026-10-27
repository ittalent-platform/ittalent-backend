import { describe, expect, it } from 'vitest';

import {
  adminReportsQuerySchema,
  adminResolveReportSchema,
  createReportBodySchema,
  createReportSchema,
  paginatedReportsResponseSchema,
  reporterReportsQuerySchema,
  reportDetailResponseSchema,
  reportHideResponseSchema,
  reportIdParamSchema,
  reportsQuerySchema,
  reportWithdrawResponseSchema,
  withdrawReportSchema,
} from '../../../src/modules/reports/reports.schemas.js';

describe('Reports Schemas Unit Tests', () => {
  describe('createReportSchema (PR #91 / Admin Intake)', () => {
    it('validates a correct job report payload', () => {
      const validPayload = {
        target_type: 'job',
        target_id: '507f1f77bcf86cd799439011',
        reason_category: 'scam_fraud',
        title: 'Fake job offering unrealistic salary',
        description: 'Employer demanded fee payment via personal bank account before interview.',
        evidence_files: ['https://example.com/receipt.png'],
        is_anonymous: true,
      };

      const result = createReportSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects short title or description', () => {
      const invalidPayload = {
        target_type: 'job',
        target_id: '507f1f77bcf86cd799439011',
        reason_category: 'scam_fraud',
        title: 'No', // < 5 chars
        description: 'Too short', // < 20 chars
      };

      const result = createReportSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid ObjectId for target_id', () => {
      const invalidPayload = {
        target_type: 'enterprise',
        target_id: 'invalid-id-format',
        reason_category: 'fee_extortion',
        title: 'Company demands recruitment deposit',
        description: 'Demanded 2 million VND upfront security deposit during phone screen.',
      };

      const result = createReportSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('rejects more than 5 evidence files', () => {
      const invalidPayload = {
        target_type: 'job',
        target_id: '507f1f77bcf86cd799439011',
        reason_category: 'other',
        title: 'Multiple policy violations observed',
        description: 'See the attached extensive list of screenshots as documentation.',
        evidence_files: [
          'https://example.com/1.png',
          'https://example.com/2.png',
          'https://example.com/3.png',
          'https://example.com/4.png',
          'https://example.com/5.png',
          'https://example.com/6.png',
        ],
      };

      const result = createReportSchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });
  });

  describe('createReportBodySchema (Candidate / MyReport)', () => {
    it('accepts valid report submission payload', () => {
      const result = createReportBodySchema.safeParse({
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'scam_or_fraud',
        statement: 'The employer requested cash payment before interview.',
        idempotencyKey: 'idemp-12345',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid target type', () => {
      const result = createReportBodySchema.safeParse({
        targetType: 'unsupported_type',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'scam_or_fraud',
        statement: 'Statement here',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty statement', () => {
      const result = createReportBodySchema.safeParse({
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'scam_or_fraud',
        statement: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('adminResolveReportSchema', () => {
    it('requires action_taken when decision is resolved', () => {
      const payloadWithoutAction = {
        decision: 'resolved',
        internal_notes: 'Verified policy violation from uploaded receipts.',
        message_to_reporter: 'We have taken action and closed the fraudulent job.',
      };

      const result = adminResolveReportSchema.safeParse(payloadWithoutAction);
      expect(result.success).toBe(false);
    });

    it('allows decision rejected without action_taken', () => {
      const validRejectPayload = {
        decision: 'rejected',
        internal_notes: 'Insufficient evidence to verify fee extortion.',
        message_to_reporter: 'Thank you for your report. We could not verify policy violation.',
      };

      const result = adminResolveReportSchema.safeParse(validRejectPayload);
      expect(result.success).toBe(true);
    });
  });

  describe('withdrawReportSchema', () => {
    it('accepts optional withdrawal_reason', () => {
      expect(withdrawReportSchema.safeParse({}).success).toBe(true);
      expect(
        withdrawReportSchema.safeParse({ withdrawal_reason: 'Resolved privately' }).success,
      ).toBe(true);
    });
  });

  describe('reporterReportsQuerySchema', () => {
    it('defaults page to 1, limit to 10, status to all', () => {
      const parsed = reporterReportsQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(10);
      expect(parsed.status).toBe('all');
    });
  });

  describe('adminReportsQuerySchema', () => {
    it('defaults status to pending, target_type to all', () => {
      const parsed = adminReportsQuerySchema.parse({});
      expect(parsed.status).toBe('pending');
      expect(parsed.target_type).toBe('all');
    });
  });

  describe('reportIdParamSchema', () => {
    it('validates 24-hex ObjectId', () => {
      expect(reportIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' }).success).toBe(true);
    });

    it('validates public reference string format (RPT-YYYY-NNNN or REP-YYYY-XXXX)', () => {
      expect(reportIdParamSchema.safeParse({ id: 'RPT-2026-0142' }).success).toBe(true);
      expect(reportIdParamSchema.safeParse({ id: 'REP-2026-1042' }).success).toBe(true);
    });

    it('rejects empty or malformed ID', () => {
      expect(reportIdParamSchema.safeParse({ id: '' }).success).toBe(false);
      expect(reportIdParamSchema.safeParse({ id: 'not-valid-id' }).success).toBe(false);
    });
  });

  describe('reportsQuerySchema', () => {
    it('applies defaults for pagination and status filter', () => {
      const result = reportsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
        expect(result.data.status).toBe('all');
      }
    });

    it('accepts valid status filters', () => {
      for (const status of ['all', 'open', 'closed']) {
        const result = reportsQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects unsupported status filter', () => {
      const result = reportsQuerySchema.safeParse({ status: 'invalid_filter' });
      expect(result.success).toBe(false);
    });
  });

  describe('Response Schemas', () => {
    it('validates paginated reports response structure', () => {
      const mockResponse = {
        items: [
          {
            id: '507f1f77bcf86cd799439011',
            reference: 'RPT-2026-0142',
            target: {
              type: 'job',
              id: '507f1f77bcf86cd799439022',
              title: 'Senior Backend Engineer (Go)',
              subtitle: 'Job · Nimbus Pay',
              isAvailable: true,
            },
            reason: 'misleading_information',
            reasonLabel: 'Misleading information',
            submittedAt: '2026-10-11T09:20:00.000Z',
            status: 'pending',
            statusLabel: 'Pending',
          },
        ],
        counts: {
          all: 5,
          open: 2,
          closed: 3,
        },
        pagination: {
          page: 1,
          limit: 10,
          total: 5,
          totalPages: 1,
        },
      };

      const result = paginatedReportsResponseSchema.safeParse(mockResponse);
      expect(result.success).toBe(true);
    });

    it('validates report detail response structure', () => {
      const mockDetail = {
        id: '507f1f77bcf86cd799439011',
        reference: 'RPT-2026-0142',
        status: 'pending',
        statusLabel: 'Pending',
        statusDescription: 'Waiting for review',
        submittedAt: '2026-10-11T09:20:00.000Z',
        target: {
          type: 'job',
          id: '507f1f77bcf86cd799439022',
          title: 'Senior Backend Engineer (Go)',
          subtitle: 'Job · Nimbus Pay',
          isAvailable: true,
        },
        reason: 'misleading_information',
        reasonLabel: 'Misleading information',
        statement: 'Statement here',
        files: [],
        responseFromPlatform: null,
        history: [{ event: 'submitted', label: 'Submitted', timestamp: '2026-10-11T09:20:00.000Z' }],
        canWithdraw: true,
        canHide: false,
      };

      const result = reportDetailResponseSchema.safeParse(mockDetail);
      expect(result.success).toBe(true);
    });

    it('validates withdraw response structure', () => {
      const mockWithdraw = {
        reference: 'RPT-2026-0142',
        status: 'withdrawn' as const,
        message: 'Report withdrawn. Review stopped and record kept.',
      };

      const result = reportWithdrawResponseSchema.safeParse(mockWithdraw);
      expect(result.success).toBe(true);
    });

    it('validates hide response structure', () => {
      const mockHide = {
        reference: 'RPT-2026-0101',
        hidden: true as const,
        message: 'Hidden from your history. ITTalent still keeps the report.',
      };

      const result = reportHideResponseSchema.safeParse(mockHide);
      expect(result.success).toBe(true);
    });
  });
});
