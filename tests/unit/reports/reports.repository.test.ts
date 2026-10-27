import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Report } from '../../../src/models/report.model.js';
import {
  CLOSED_REPORT_STATUSES,
  OPEN_REPORT_STATUSES,
} from '../../../src/modules/reports/reports.constants.js';
import { reportsRepository } from '../../../src/modules/reports/reports.repository.js';

describe('ReportsRepository Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateNextReference', () => {
    it('generates RPT-YYYY-0001 when no existing reports exist for current year', async () => {
      const mockFindOne = vi.spyOn(Report, 'findOne').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      } as never);

      const fixedDate = new Date('2026-10-15T12:00:00Z');
      const ref = await reportsRepository.generateNextReference(fixedDate);

      expect(ref).toBe('RPT-2026-0001');
      expect(mockFindOne).toHaveBeenCalled();
    });

    it('increments sequence when previous reports exist in current year', async () => {
      vi.spyOn(Report, 'findOne').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142' }),
      } as never);

      const fixedDate = new Date('2026-10-15T12:00:00Z');
      const ref = await reportsRepository.generateNextReference(fixedDate);

      expect(ref).toBe('RPT-2026-0143');
    });
  });

  describe('findByIdOrReference', () => {
    it('finds report by public reference string', async () => {
      const mockExec = vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142' });
      vi.spyOn(Report, 'findOne').mockReturnValue({ exec: mockExec } as never);

      const report = await reportsRepository.findByIdOrReference('RPT-2026-0142');

      expect(Report.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [{ reference: 'RPT-2026-0142' }],
        }),
      );
      expect(report).toEqual({ reference: 'RPT-2026-0142' });
    });

    it('includes reporter_id in filter when provided', async () => {
      const mockExec = vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142' });
      vi.spyOn(Report, 'findOne').mockReturnValue({ exec: mockExec } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      await reportsRepository.findByIdOrReference('RPT-2026-0142', reporterId);

      expect(Report.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
        }),
      );
    });
  });

  describe('findDuplicate', () => {
    it('checks by idempotency_key when provided', async () => {
      const mockExec = vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142' });
      vi.spyOn(Report, 'findOne').mockReturnValue({ exec: mockExec } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      const targetId = '507f1f77bcf86cd799439022';
      const result = await reportsRepository.findDuplicate(reporterId, 'job', targetId, 'client-key-123');

      expect(Report.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          idempotency_key: 'client-key-123',
        }),
      );
      expect(result).toBeDefined();
    });

    it('checks by reporter, target, and open statuses when no idempotency key given', async () => {
      const mockExec = vi.fn().mockResolvedValue(null);
      vi.spyOn(Report, 'findOne').mockReturnValue({ exec: mockExec } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      const targetId = '507f1f77bcf86cd799439022';
      await reportsRepository.findDuplicate(reporterId, 'job', targetId);

      expect(Report.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          target_type: 'job',
          target_id: expect.anything(),
          status: { $in: OPEN_REPORT_STATUSES },
        }),
      );
    });
  });

  describe('listByReporter and countStatusesByReporter', () => {
    it('applies open status filter and excludes hidden reports', async () => {
      const mockFind = vi.spyOn(Report, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      } as never);
      vi.spyOn(Report, 'countDocuments').mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      await reportsRepository.listByReporter(reporterId, { page: 1, limit: 10, status: 'open' });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          hidden_by_reporter: false,
          status: { $in: OPEN_REPORT_STATUSES },
        }),
      );
    });

    it('applies search filter across reference, title, and enterprise name', async () => {
      const mockFind = vi.spyOn(Report, 'find').mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      } as never);
      vi.spyOn(Report, 'countDocuments').mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      await reportsRepository.listByReporter(reporterId, {
        page: 1,
        limit: 10,
        status: 'all',
        search: 'Nimbus',
      });

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          hidden_by_reporter: false,
          $or: expect.arrayContaining([
            expect.objectContaining({ reference: expect.anything() }),
            expect.objectContaining({ 'target_snapshot.title': expect.anything() }),
            expect.objectContaining({ 'target_snapshot.enterprise_name': expect.anything() }),
          ]),
        }),
      );
    });

    it('counts all, open, and closed non-hidden reports', async () => {
      vi.spyOn(Report, 'countDocuments')
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(5) } as never)
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(2) } as never)
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(3) } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      const counts = await reportsRepository.countStatusesByReporter(reporterId);

      expect(counts).toEqual({ all: 5, open: 2, closed: 3 });
    });
  });

  describe('withdrawIfPending', () => {
    it('executes atomic findOneAndUpdate with status: pending filter', async () => {
      const mockFindOneAndUpdate = vi.spyOn(Report, 'findOneAndUpdate').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ status: 'withdrawn' }),
      } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      const result = await reportsRepository.withdrawIfPending('RPT-2026-0142', reporterId);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          status: 'pending',
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'withdrawn' }),
        }),
        expect.objectContaining({ returnDocument: 'after' }),
      );
      expect(result).toEqual({ status: 'withdrawn' });
    });
  });

  describe('hideIfClosed', () => {
    it('executes atomic update with status in closed statuses filter', async () => {
      const mockFindOneAndUpdate = vi.spyOn(Report, 'findOneAndUpdate').mockReturnValue({
        exec: vi.fn().mockResolvedValue({ hidden_by_reporter: true }),
      } as never);

      const reporterId = '507f1f77bcf86cd799439011';
      const result = await reportsRepository.hideIfClosed('RPT-2026-0101', reporterId);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          reporter_id: expect.anything(),
          status: { $in: CLOSED_REPORT_STATUSES },
        }),
        expect.objectContaining({
          $set: expect.objectContaining({ hidden_by_reporter: true }),
        }),
        expect.anything(),
      );
      expect(result).toEqual({ hidden_by_reporter: true });
    });
  });
});
