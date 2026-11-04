import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ApplicationsService } from '../../../src/modules/applications/applications.service.js';
import { ApplicationsController } from '../../../src/modules/applications/applications.controller.js';
import { HTTP_STATUS } from '../../../src/shared/constants/http-status.js';
import type {
  ApplicationDetailDTO,
  ApplicationHistoryEntryDTO,
  ApplicationListResponse,
  ApplicationSummaryDTO,
} from '../../../src/modules/applications/applications.schemas.js';

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
    certificates: [],
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
      applyToJob: vi.fn(),
      list: vi.fn(),
      getDetail: vi.fn(),
      getHistory: vi.fn(),
      withdraw: vi.fn(),
    };
    controller = new ApplicationsController(mockService as ApplicationsService);
  });

  describe('createApplication (BR-APP-009)', () => {
    const body = { jobPostingId: '507f1f77bcf86cd799439012', cvId: '507f1f77bcf86cd799439013' };
    const created = {
      id: '507f1f77bcf86cd7994390bb',
      jobPostingId: body.jobPostingId,
      status: 'submitted',
      cvId: body.cvId,
      coverLetterId: null,
      message: null,
      reappliedFrom: null,
      reappliedAs: null,
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    };

    function call(headers: Record<string, string>): { run: () => Promise<void>; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn>; next: ReturnType<typeof vi.fn> } {
      const json = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      const setHeader = vi.fn();
      const next = vi.fn();
      const req = {
        user: { id: 'user-1', email: 'user@example.com', role: 'user' },
        get: (name: string) => headers[name],
      } as never;
      const res = { status, setHeader, locals: { validated: { body } } } as never;
      const run = async (): Promise<void> => {
        await controller.createApplication(req, res, next);
      };
      return { run, status, json, setHeader, next };
    }

    it('answers 201 and passes the Idempotency-Key to the service', async () => {
      mockService.applyToJob = vi.fn().mockResolvedValue({ item: created, replayed: false });
      const { run, status, json, setHeader } = call({ 'Idempotency-Key': ' attempt-0001 ' });

      await run();

      expect(mockService.applyToJob).toHaveBeenCalledWith('user-1', body, 'attempt-0001');
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
      expect(json).toHaveBeenCalledWith(created);
      expect(setHeader).not.toHaveBeenCalled();
    });

    it('answers 200 with Idempotency-Replayed when the application was already committed', async () => {
      mockService.applyToJob = vi.fn().mockResolvedValue({ item: created, replayed: true });
      const { run, status, json, setHeader } = call({ 'Idempotency-Key': 'attempt-0001' });

      await run();

      expect(setHeader).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_200_OK);
      expect(json).toHaveBeenCalledWith(created);
    });

    it('works without a key, as before', async () => {
      mockService.applyToJob = vi.fn().mockResolvedValue({ item: created, replayed: false });
      const { run, status } = call({});

      await run();

      expect(mockService.applyToJob).toHaveBeenCalledWith('user-1', body, undefined);
      expect(status).toHaveBeenCalledWith(HTTP_STATUS.HTTP_201_CREATED);
    });

    it.each([['blank', '   '], ['with a space inside', 'two words'], ['not ASCII', 'khóa-thử'], ['too long', 'k'.repeat(129)]])('refuses a key that is %s and does not apply', async (_label, key) => {
      mockService.applyToJob = vi.fn();
      const { run, next, status } = call({ 'Idempotency-Key': key });

      await run();

      expect(mockService.applyToJob).not.toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: HTTP_STATUS.HTTP_400_BAD_REQUEST }));
    });
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
