import { describe, expect, it } from 'vitest';

import {
  createReportBodySchema,
  paginatedReportsResponseSchema,
  reportDetailResponseSchema,
  reportHideResponseSchema,
  reportIdParamSchema,
  reportsQuerySchema,
  reportWithdrawResponseSchema,
} from '../../../src/modules/reports/reports.schemas.js';

describe('Reports Validation Schemas', () => {
  describe('createReportBodySchema', () => {
    it('accepts valid report submission payload', () => {
      const validPayload = {
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'misleading_information',
        statement: 'The post salary says 50M but recruiter offered 20M.',
      };

      const result = createReportBodySchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('rejects payload with invalid targetId format', () => {
      const invalidPayload = {
        targetType: 'job',
        targetId: 'invalid-id',
        reason: 'misleading_information',
        statement: 'Details here',
      };

      const result = createReportBodySchema.safeParse(invalidPayload);
      expect(result.success).toBe(false);
    });

    it('rejects empty or whitespace-only statement', () => {
      const emptyPayload = {
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'misleading_information',
        statement: '   ',
      };

      const result = createReportBodySchema.safeParse(emptyPayload);
      expect(result.success).toBe(false);
    });

    it('rejects invalid reason enum', () => {
      const invalidReason = {
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'unsupported_reason',
        statement: 'Statement here',
      };

      const result = createReportBodySchema.safeParse(invalidReason);
      expect(result.success).toBe(false);
    });

    it('enforces maximum of 5 evidence files', () => {
      const sixFiles = Array.from({ length: 6 }, (_, i) => ({
        fileUrl: `https://example.com/file${i}.png`,
        storageKey: `key-${i}`,
        fileName: `file${i}.png`,
        mimeType: 'image/png',
        size: 1024,
      }));

      const payload = {
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439011',
        reason: 'scam_or_fraud',
        statement: 'Scam post details',
        evidenceFiles: sixFiles,
      };

      const result = createReportBodySchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('reportIdParamSchema', () => {
    it('accepts 24-character hexadecimal ObjectId', () => {
      const result = reportIdParamSchema.safeParse({ id: '507f1f77bcf86cd799439011' });
      expect(result.success).toBe(true);
    });

    it('accepts public reference string format (RPT-YYYY-NNNN)', () => {
      const result = reportIdParamSchema.safeParse({ id: 'RPT-2026-0142' });
      expect(result.success).toBe(true);
    });

    it('rejects malformed ID or reference', () => {
      const result = reportIdParamSchema.safeParse({ id: 'not-valid' });
      expect(result.success).toBe(false);
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
