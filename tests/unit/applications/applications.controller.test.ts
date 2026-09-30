import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ApplicationsService } from '../../../src/modules/applications/applications.service.js';
import { ApplicationsController } from '../../../src/modules/applications/applications.controller.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import type {
  ApplicationDetailDTO,
  ApplicationHistoryEntryDTO,
  ApplicationListResponse,
  ApplicationSummaryDTO,
} from '../../../src/modules/applications/applications.openapi.js';

describe('ApplicationsController', () => {
let mockService: Partial<ApplicationsService>;
  let controller: ApplicationsController;

  const mockDetail: ApplicationDetailDTO = {
    id: '507f1f77bcf86cd799439011',
    jobId: '507f1f77bcf86cd799439012',
    job: {
      title: 'Software Engineer',
      companyName: 'Tech Corp',
      location: null,
      jobType: null,
      deadline: null,
      publicStatus: 'open',
    },
    status: 'submitted',
    reviewStage: null,
    submittedDocuments: [],
    message: null,
    attachments: [],
    canWithdraw: true,
    canApplyAgain: false,
    reappliedFrom: null,
    reappliedAs: null,
    withdrawnAt: null,
    withdrawalReason: null,
    version: 0,
    submittedAt: '2026-09-01T10:00:00.000Z',
    latestStatusAt: '2026-09-01T10:00:00.000Z',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };

  const mockList: ApplicationListResponse = {
    items: [
      {
        id: mockDetail.id,
        jobId: mockDetail.jobId,
        job: mockDetail.job,
        status: mockDetail.status,
        reviewStage: mockDetail.reviewStage,
        submittedDocuments: mockDetail.submittedDocuments,
        canWithdraw: mockDetail.canWithdraw,
        canApplyAgain: mockDetail.canApplyAgain,
        reappliedFrom: mockDetail.reappliedFrom,
        reappliedAs: mockDetail.reappliedAs,
        submittedAt: mockDetail.submittedAt,
        latestStatusAt: mockDetail.latestStatusAt,
        withdrawnAt: mockDetail.withdrawnAt,
      } satisfies ApplicationSummaryDTO,
    ],
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
    statusCounts: {
      submitted: 1,
      under_review: 0,
      interviewing: 0,
      offered: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
      position_filled: 0,
    },
  };

  const mockHistory: {
    items: ApplicationHistoryEntryDTO[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } = {
    items: [
      {
        status: 'submitted',
        reviewStage: null,
        actorRole: 'candidate',
        occurredAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    page: 1,
    limit: 10,
    total: 1,
    totalPages: 1,
  };

  beforeEach(() => {
    mockService = {
      list: vi.fn(),
      getDetail: vi.fn(),
      getHistory: vi.fn(),
      withdraw: vi.fn(),
    };
    controller = new ApplicationsController(mockService as ApplicationsService);
  });

  describe('listMine', () => {
    it('returns 200 with list and status counts on success', async () => {
      mockService.list = vi.fn().mockResolvedValue(mockList);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: {
          validated: {
            query: { page: 1, limit: 10 },
          },
        },
      } as never;
      const res = {
        status,
        locals: { validated: { query: {} } },
      } as never;
      const next = vi.fn();

      await controller.listMine(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockList);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Unauthorized');
      mockService.list = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: { validated: { query: {} } },
      } as never;
      const res = {
        status: vi.fn(),
        locals: { validated: { query: {} } },
      } as never;
      const next = vi.fn();

      await controller.listMine(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getDetail', () => {
    it('returns 200 with detail on success', async () => {
      mockService.getDetail = vi.fn().mockResolvedValue(mockDetail);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
          },
        },
      } as never;
      const res = {
        status,
        locals: { validated: { params: {} } },
      } as never;
      const next = vi.fn();

      await controller.getDetail(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockDetail);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Not found');
      mockService.getDetail = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: { validated: { params: { id: 'bad' } } },
      } as never;
      const res = {
        status: vi.fn(),
        locals: { validated: { params: {} } },
      } as never;
      const next = vi.fn();

      await controller.getDetail(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getHistory', () => {
    it('returns 200 with paginated history on success', async () => {
      mockService.getHistory = vi.fn().mockResolvedValue(mockHistory);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
            query: { page: 1, limit: 10 },
          },
        },
      } as never;
      const res = {
        status,
        locals: { validated: { params: {}, query: {} } },
      } as never;
      const next = vi.fn();

      await controller.getHistory(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(mockHistory);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('History failed');
      mockService.getHistory = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: { validated: { params: { id: '507f1f77bcf86cd799439011' }, query: {} } },
      } as never;
      const res = {
        status: vi.fn(),
        locals: { validated: { params: {}, query: {} } },
      } as never;
      const next = vi.fn();

      await controller.getHistory(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('withdraw', () => {
    it('returns 200 with updated detail on success', async () => {
      const withdrawn = { ...mockDetail, status: 'withdrawn', canWithdraw: false };
      mockService.withdraw = vi.fn().mockResolvedValue(withdrawn);

      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
            body: { expectedVersion: 0, reason: 'Found better fit' },
          },
        },
      } as never;
      const res = {
        status,
        locals: { validated: { params: {}, body: {} } },
      } as never;
      const next = vi.fn();

      await controller.withdraw(req, res, next);

      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(withdrawn);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards error to next when service throws', async () => {
      const error = new Error('Conflict');
      mockService.withdraw = vi.fn().mockRejectedValue(error);

      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        locals: {
          validated: {
            params: { id: '507f1f77bcf86cd799439011' },
            body: { expectedVersion: 0 },
          },
        },
      } as never;
      const res = {
        status: vi.fn(),
        locals: { validated: { params: {}, body: {} } },
      } as never;
      const next = vi.fn();

      await controller.withdraw(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
