import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { JobPosting } from '../../../src/models/job-posting.model.js';
import type { ReportDoc } from '../../../src/models/report.model.js';
import { REPORT_MESSAGES } from '../../../src/modules/reports/reports.constants.js';
import type { ReportsRepository } from '../../../src/modules/reports/reports.repository.js';
import { ReportsService } from '../../../src/modules/reports/reports.service.js';
import type { StorageService } from '../../../src/shared/services/storage.service.js';

describe('ReportsService - Query Unit Tests', () => {
  let mockRepo: ReportsRepository;
  let mockStorage: StorageService;
  let service: ReportsService;

  const reporterId = '507f1f77bcf86cd799439011';
  const targetJobId = new Types.ObjectId('507f1f77bcf86cd799439022');
  const reportObjectId = new Types.ObjectId('507f1f77bcf86cd799439033');

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      listByReporter: vi.fn(),
      countStatusesByReporter: vi.fn().mockResolvedValue({ all: 5, open: 2, closed: 3 }),
      findByIdOrReference: vi.fn(),
    } as unknown as ReportsRepository;

    mockStorage = {} as unknown as StorageService;

    service = new ReportsService(mockRepo, mockStorage);
  });

  describe('listReports', () => {
    it('returns paginated reports with dynamic target availability and status counts', async () => {
      const mockDoc = {
        _id: reportObjectId,
        reference: 'RPT-2026-0142',
        target_type: 'job',
        target_id: targetJobId,
        target_snapshot: {
          title: 'Senior Backend Engineer (Go)',
          subtitle: 'Job · Nimbus Pay',
        },
        reason: 'misleading_information',
        createdAt: new Date('2026-10-11T09:20:00Z'),
        status: 'pending',
      } as unknown as ReportDoc;

      mockRepo.listByReporter = vi.fn().mockResolvedValue({
        items: [mockDoc],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({
          status: 'published',
          deleting: false,
        }),
      } as never);

      const response = await service.listReports(reporterId, { page: 1, limit: 10, status: 'all' });

      expect(response.counts).toEqual({ all: 5, open: 2, closed: 3 });
      expect(response.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
      expect(response.items[0]).toMatchObject({
        reference: 'RPT-2026-0142',
        target: {
          type: 'job',
          title: 'Senior Backend Engineer (Go)',
          subtitle: 'Job · Nimbus Pay',
          isAvailable: true,
        },
        reason: 'misleading_information',
        reasonLabel: 'Misleading information',
        status: 'pending',
        statusLabel: 'Pending',
      });
    });

    it('sets isAvailable: false when job target has been deleted or closed', async () => {
      const mockDoc = {
        _id: reportObjectId,
        reference: 'RPT-2026-0142',
        target_type: 'job',
        target_id: targetJobId,
        target_snapshot: {
          title: 'UI Designer',
          subtitle: 'Job · Sunrise Apps',
        },
        reason: 'discrimination',
        createdAt: new Date('2026-09-02T10:00:00Z'),
        status: 'withdrawn',
      } as unknown as ReportDoc;

      mockRepo.listByReporter = vi.fn().mockResolvedValue({
        items: [mockDoc],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as never);

      const response = await service.listReports(reporterId, { page: 1, limit: 10, status: 'all' });

      expect(response.items[0]?.target.isAvailable).toBe(false);
      expect(response.items[0]?.target.title).toBe('UI Designer');
    });
  });

  describe('getReportDetail', () => {
    it('returns full report detail with files, timeline history, and permissions', async () => {
      const mockDoc = {
        _id: reportObjectId,
        reference: 'RPT-2026-0142',
        target_type: 'job',
        target_id: targetJobId,
        target_snapshot: {
          title: 'Senior Backend Engineer (Go)',
          subtitle: 'Job · Nimbus Pay',
        },
        reason: 'misleading_information',
        statement: 'Salary offered was 20M instead of 60M.',
        status: 'pending',
        createdAt: new Date('2026-10-11T09:20:00Z'),
        evidence_files: [
          {
            _id: new Types.ObjectId('507f1f77bcf86cd799439044'),
            file_name: 'call-notes.pdf',
            size: 1048576,
            mime_type: 'application/pdf',
            file_url: 'https://cloudinary.com/call-notes.pdf',
            storage_key: 'evidence/call-notes',
          },
        ],
        resolution_response: null,
        status_history: [
          {
            status: 'pending',
            changed_at: new Date('2026-10-11T09:20:00Z'),
            changed_by: new Types.ObjectId(reporterId),
          },
        ],
        hidden_by_reporter: false,
      } as unknown as ReportDoc;

      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue(mockDoc);

      vi.spyOn(JobPosting, 'findById').mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ status: 'published', deleting: false }),
      } as never);

      const detail = await service.getReportDetail(reporterId, 'RPT-2026-0142');

      expect(detail.reference).toBe('RPT-2026-0142');
      expect(detail.canWithdraw).toBe(true);
      expect(detail.canHide).toBe(false);
      expect(detail.files).toHaveLength(1);
      expect(detail.files[0]?.fileName).toBe('call-notes.pdf');
      expect(detail.history).toEqual([
        { event: 'submitted', label: 'Submitted', timestamp: '2026-10-11T09:20:00.000Z' },
      ]);
    });

    it('throws 404 when report not found or is hidden by reporter', async () => {
      mockRepo.findByIdOrReference = vi.fn().mockResolvedValue(null);

      await expect(service.getReportDetail(reporterId, 'RPT-not-found')).rejects.toMatchObject({
        statusCode: 404,
        message: REPORT_MESSAGES.REPORT_NOT_FOUND,
      });
    });
  });
});
