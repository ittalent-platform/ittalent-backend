import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportsController } from '../../../src/modules/reports/reports.controller.js';
import type { ReportsService } from '../../../src/modules/reports/reports.service.js';

describe('ReportsController - submitReport Unit Tests', () => {
  let mockService: ReportsService;
  let controller: ReportsController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();

    mockService = {
      submitReport: vi.fn().mockResolvedValue({
        reference: 'RPT-2026-0142',
        message: 'Report received. You can follow it in My reports.',
      }),
    } as unknown as ReportsService;

    controller = new ReportsController(mockService);

    mockReq = {
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'applicant@example.com',
        role: 'applicant',
        authVersion: 1,
      },
      body: {
        targetType: 'job',
        targetId: '507f1f77bcf86cd799439022',
        reason: 'misleading_information',
        statement: 'Statement text',
      },
      files: [],
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    next = vi.fn();
  });

  it('submits report successfully and returns 201 Created', async () => {
    await controller.submitReport(mockReq as Request, mockRes as Response, next);

    expect(mockRes.status).toHaveBeenCalledWith(201);
    expect(mockRes.json).toHaveBeenCalledWith({
      reference: 'RPT-2026-0142',
      message: 'Report received. You can follow it in My reports.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards 401 UNAUTHORIZED error when user is not authenticated', async () => {
    delete mockReq.user;

    await controller.submitReport(mockReq as Request, mockRes as Response, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Authentication required',
      }),
    );
  });

  it('forwards service errors to error handler next()', async () => {
    const error = new Error('Service failure');
    mockService.submitReport = vi.fn().mockRejectedValue(error);

    await controller.submitReport(mockReq as Request, mockRes as Response, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
