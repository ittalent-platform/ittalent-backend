import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportsController } from '../../../src/modules/reports/reports.controller.js';
import type { ReportsService } from '../../../src/modules/reports/reports.service.js';

describe('ReportsController - Lifecycle & Query Handlers', () => {
  let mockService: ReportsService;
  let controller: ReportsController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      listReports: vi.fn().mockResolvedValue({ items: [], counts: { all: 0, open: 0, closed: 0 }, pagination: {} }),
      getReportDetail: vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142' }),
      withdrawReport: vi.fn().mockResolvedValue({ reference: 'RPT-2026-0142', status: 'withdrawn' }),
      hideReport: vi.fn().mockResolvedValue({ reference: 'RPT-2026-0101', hidden: true }),
    } as unknown as ReportsService;

    controller = new ReportsController(mockService);

    mockReq = {
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'applicant@example.com',
        role: 'applicant',
        authVersion: 1,
      },
      params: { id: 'RPT-2026-0142' },
      query: {},
      body: {},
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  describe('listReports', () => {
    it('calls service.listReports and returns 200 OK', async () => {
      await controller.listReports(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockService.listReports).toHaveBeenCalledWith('507f1f77bcf86cd799439011', expect.anything());
    });

    it('forwards 401 UNAUTHORIZED when user is not present', async () => {
      delete mockReq.user;
      await controller.listReports(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
  });

  describe('getReportDetail', () => {
    it('calls service.getReportDetail with param id and returns 200 OK', async () => {
      await controller.getReportDetail(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockService.getReportDetail).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'RPT-2026-0142');
    });
  });

  describe('withdrawReport', () => {
    it('calls service.withdrawReport with param id and returns 200 OK', async () => {
      mockReq.body = { note: 'Mistake report' };
      await controller.withdrawReport(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockService.withdrawReport).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'RPT-2026-0142',
        'Mistake report',
      );
    });
  });

  describe('hideReport', () => {
    it('calls service.hideReport with param id and returns 200 OK', async () => {
      await controller.hideReport(mockReq as Request, mockRes as Response, next);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockService.hideReport).toHaveBeenCalledWith('507f1f77bcf86cd799439011', 'RPT-2026-0142');
    });
  });
});
