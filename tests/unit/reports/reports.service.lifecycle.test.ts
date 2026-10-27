import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReportDoc } from '../../../src/models/report.model.js';
import { REPORT_MESSAGES } from '../../../src/modules/reports/reports.constants.js';
import { ReportsRepository } from '../../../src/modules/reports/reports.repository.js';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';
import { StorageService } from '../../../src/shared/services/storage.service.js';

describe('ReportsService - Lifecycle Operations (Withdraw & Hide)', () => {
  let mockRepo: ReportsRepository;
  let mockStorage: StorageService;
  let service: ReportsService;

  const reporterId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      findByIdOrReference: vi.fn(),
      withdrawIfPending: vi.fn(),
      hideIfClosed: vi.fn(),
    } as unknown as ReportsRepository;

    mockStorage = {} as unknown as StorageService;

    service = new ReportsService(mockRepo, mockStorage);
  });

  describe('withdrawReport', () => {
    it('withdraws pending report and returns confirmation', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        status: 'pending',
        hidden_by_reporter: false,
      } as ReportDoc);

      mockRepo.withdrawIfPending = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        status: 'withdrawn',
      } as ReportDoc);

      const result = await service.withdrawReport(reporterId, 'RPT-2026-0142');

      expect(result.status).toBe('withdrawn');
      expect(result.message).toBe(REPORT_MESSAGES.WITHDRAW_SUCCESS);
      expect(mockRepo.withdrawIfPending).toHaveBeenCalledWith('RPT-2026-0142', reporterId, undefined);
    });

    it('rejects with 409 REVIEW_ALREADY_STARTED when report is already under review or closed', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        status: 'reviewing',
        hidden_by_reporter: false,
      } as ReportDoc);

      await expect(service.withdrawReport(reporterId, 'RPT-2026-0142')).rejects.toMatchObject({
        statusCode: 409,
        message: REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
      });

      expect(mockRepo.withdrawIfPending).not.toHaveBeenCalled();
    });

    it('rejects with 409 if atomic withdraw lost race condition against reviewer action', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        status: 'pending',
        hidden_by_reporter: false,
      } as ReportDoc);

      mockRepo.withdrawIfPending = vi.fn().mockResolvedValue(null);

      await expect(service.withdrawReport(reporterId, 'RPT-2026-0142')).rejects.toMatchObject({
        statusCode: 409,
        message: REPORT_MESSAGES.REVIEW_ALREADY_STARTED,
      });
    });

    it('throws 404 when report not found', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue(null);

      await expect(service.withdrawReport(reporterId, 'RPT-not-found')).rejects.toMatchObject({
        statusCode: 404,
        message: REPORT_MESSAGES.REPORT_NOT_FOUND,
      });
    });
  });

  describe('hideReport', () => {
    it('soft-hides closed report (resolved, rejected, or withdrawn) from applicant history', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0101',
        status: 'resolved',
      } as ReportDoc);

      mockRepo.hideIfClosed = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0101',
        hidden_by_reporter: true,
      } as ReportDoc);

      const result = await service.hideReport(reporterId, 'RPT-2026-0101');

      expect(result.hidden).toBe(true);
      expect(result.message).toBe(REPORT_MESSAGES.HIDE_SUCCESS);
      expect(mockRepo.hideIfClosed).toHaveBeenCalledWith('RPT-2026-0101', reporterId);
    });

    it('rejects with 400 REPORT_NOT_CLOSED when report is still open (pending/reviewing)', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        status: 'pending',
      } as ReportDoc);

      await expect(service.hideReport(reporterId, 'RPT-2026-0142')).rejects.toMatchObject({
        statusCode: 400,
        message: REPORT_MESSAGES.REPORT_NOT_CLOSED,
      });

      expect(mockRepo.hideIfClosed).not.toHaveBeenCalled();
    });

    it('throws 404 when report not found', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue(null);

      await expect(service.hideReport(reporterId, 'RPT-not-found')).rejects.toMatchObject({
        statusCode: 404,
        message: REPORT_MESSAGES.REPORT_NOT_FOUND,
      });
    });
  });
});
