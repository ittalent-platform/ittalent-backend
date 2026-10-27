import { describe, expect, it } from 'vitest';

import {
  adminReportsQuerySchema,
  adminResolveReportSchema,
  createReportSchema,
  reporterReportsQuerySchema,
  reportIdParamSchema,
  withdrawReportSchema,
} from '../../../src/modules/reports/reports.schemas.js';

describe('Reports Schemas Unit Tests', () => {
  describe('createReportSchema', () => {
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
          'https://example.com/6.png', // 6th file
        ],
      };

      const result = createReportSchema.safeParse(invalidPayload);
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
      expect(parsed.category).toBe('all');
    });
  });

  describe('reportIdParamSchema', () => {
    it('validates report id string', () => {
      expect(reportIdParamSchema.safeParse({ id: 'REP-2026-1042' }).success).toBe(true);
      expect(reportIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' }).success).toBe(true);
      expect(reportIdParamSchema.safeParse({ id: '' }).success).toBe(false);
    });
  });
});
