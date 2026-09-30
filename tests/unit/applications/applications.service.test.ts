import mongoose from 'mongoose';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { ApplicationDoc } from '../../../src/models/application.model.js';
import type { ApplicationsRepository } from '../../../src/modules/applications/applications.repository.js';
import { ApplicationsService } from '../../../src/modules/applications/applications.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';
import {
  APPLICATION_MESSAGES,
  createEmptyStatusCounts,
} from '../../../src/modules/applications/applications.constants.js';
import type { ApplicationListQuery } from '../../../src/modules/applications/applications.schemas.js';

const makeApplicationDoc = (overrides: Partial<ApplicationDoc>): ApplicationDoc => {
  const base = {
    _id: new mongoose.Types.ObjectId(),
    applicant_id: new mongoose.Types.ObjectId(),
    job_id: new mongoose.Types.ObjectId(),
    status: 'submitted',
    job_snapshot: {
      title: 'Software Engineer',
      company_name: 'Tech Corp',
      location: 'Ho Chi Minh City',
      job_type: 'Full-time',
      deadline: new Date('2026-12-31T23:59:59.000Z'),
      public_status: 'open',
    },
    attachments: [],
    message: null,
    withdrawal_reason: null,
    withdrawn_at: null,
    version: 0,
    submitted_at: new Date('2026-09-01T10:00:00.000Z'),
    latest_status_at: new Date('2026-09-01T10:00:00.000Z'),
    history: [],
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-09-01T10:00:00.000Z'),
  };

  return { ...base, ...overrides } as unknown as ApplicationDoc;
};

describe('ApplicationsService', () => {
  let mockRepo: Partial<ApplicationsRepository>;
  let service: ApplicationsService;
  const applicantId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    mockRepo = {
      create: vi.fn(),
      findPageByApplicant: vi.fn(),
      countByStatus: vi.fn(),
      findOwnedById: vi.fn(),
      findHistoryPage: vi.fn(),
      withdrawAtomically: vi.fn(),
    };
    service = new ApplicationsService(mockRepo as ApplicationsRepository, { findById: vi.fn().mockResolvedValue({ role: 'user', status: 'active' }) } as unknown as UsersService);
  });

  describe('list', () => {
    const applicantId = new mongoose.Types.ObjectId().toString();

    it('returns paginated list and status counts', async () => {
      const page = 1;
      const limit = 10;
      const query: ApplicationListQuery = { page, limit, sortBy: 'submittedAt', sortOrder: 'desc' };

      const mockItems = [
        makeApplicationDoc({ _id: new mongoose.Types.ObjectId() }),
        makeApplicationDoc({ _id: new mongoose.Types.ObjectId(), status: 'under_review' }),
      ];
      const mockTotal = 2;
      const mockStatusCounts = { submitted: 1, under_review: 1, interviewing: 0, offered: 0, hired: 0, rejected: 0, withdrawn: 0, position_filled: 0 };

      mockRepo.findPageByApplicant = vi.fn().mockResolvedValue({ items: mockItems, total: mockTotal });
      mockRepo.countByStatus = vi.fn().mockResolvedValue(mockStatusCounts);

      const result = await service.list(applicantId, query);

      expect(mockRepo.findPageByApplicant).toHaveBeenCalledWith(applicantId, {
        page,
        limit,
        sortBy: 'submittedAt',
        sortOrder: 'desc',
        filters: {
          statuses: undefined,
          jobId: undefined,
          reviewStage: undefined,
          keyword: undefined,
          submittedFrom: undefined,
          submittedTo: undefined,
        },
      });
      expect(mockRepo.countByStatus).toHaveBeenCalledWith(applicantId, {
        statuses: undefined,
        jobId: undefined,
        reviewStage: undefined,
        keyword: undefined,
        submittedFrom: undefined,
        submittedTo: undefined,
      });
      expect(result.page).toBe(page);
      expect(result.limit).toBe(limit);
      expect(result.total).toBe(mockTotal);
      expect(result.totalPages).toBe(1);
      expect(result.items).toHaveLength(2);
      expect(result.statusCounts).toEqual(mockStatusCounts);
    });

    it('applies filters correctly', async () => {
      const query: ApplicationListQuery = {
        status: 'under_review,interviewing',
        sortBy: 'latestStatusAt',
        sortOrder: 'asc',
        jobId: '507f1f77bcf86cd799439011',
        reviewStage: 'screening',
        search: 'engineer',
        page: 2,
        limit: 5,
        submittedFrom: new Date('2026-01-01T00:00:00.000Z'),
        submittedTo: new Date('2026-12-31T23:59:59.000Z'),
      };

      mockRepo.findPageByApplicant = vi.fn().mockResolvedValue({ items: [], total: 0 });
      mockRepo.countByStatus = vi.fn().mockResolvedValue(createEmptyStatusCounts());

      await service.list(applicantId, query);

      expect(mockRepo.findPageByApplicant).toHaveBeenCalledWith(applicantId, {
        page: 2,
        limit: 5,
        sortBy: 'latestStatusAt',
        sortOrder: 'asc',
        filters: {
          statuses: ['under_review', 'interviewing'],
          jobId: '507f1f77bcf86cd799439011',
          reviewStage: 'screening',
          keyword: 'engineer',
          submittedFrom: new Date('2026-01-01T00:00:00.000Z'),
          submittedTo: new Date('2026-12-31T23:59:59.000Z'),
        },
      });
      expect(mockRepo.countByStatus).toHaveBeenCalledWith(applicantId, {
        statuses: ['under_review', 'interviewing'],
        jobId: '507f1f77bcf86cd799439011',
        reviewStage: 'screening',
        keyword: 'engineer',
        submittedFrom: new Date('2026-01-01T00:00:00.000Z'),
        submittedTo: new Date('2026-12-31T23:59:59.000Z'),
      });
    });
  });

  describe('getDetail', () => {
    it('returns detail when owned', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const mockDoc = makeApplicationDoc({
        _id: new mongoose.Types.ObjectId(id),
        applicant_id: new mongoose.Types.ObjectId(applicantId),
        status: 'under_review',
        review_stage: 'interview',
        message: 'Great opportunity!',
      });

      mockRepo.findOwnedById = vi.fn().mockResolvedValue(mockDoc);

      const result = await service.getDetail(applicantId, id);

      expect(mockRepo.findOwnedById).toHaveBeenCalledWith(id, applicantId);
      expect(result.id).toBe(id);
      expect(result.status).toBe('under_review');
      expect(result.reviewStage).toBe('interview');
      expect(result.message).toBe('Great opportunity!');
    });

    it('throws 404 when not owned', async () => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(null);

      await expect(service.getDetail(applicantId, '507f1f77bcf86cd799439011')).rejects.toThrow(
        APPLICATION_MESSAGES.NOT_FOUND,
      );
    });
  });

  describe('getHistory', () => {
    it('returns paginated history in chronological order', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const now = new Date();
      const history = [
          { status: 'submitted', actor_role: 'candidate', occurred_at: new Date(now.getTime() - 2000) },
          { status: 'under_review', actor_role: 'company', occurred_at: new Date(now.getTime() - 1000) },
          { status: 'interviewing', actor_role: 'company', occurred_at: now },
        ] as const;

      mockRepo.findHistoryPage = vi.fn().mockResolvedValue({ found: true, total: 3, items: history.slice(0, 2) });

      const result = await service.getHistory(applicantId, id, 1, 2);

      expect(mockRepo.findHistoryPage).toHaveBeenCalledWith(id, applicantId, 1, 2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(3);
      expect(result.totalPages).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]?.status).toBe('submitted');
      expect(result.items[0]?.actorRole).toBe('candidate');
      expect(result.items[1]?.status).toBe('under_review');
      expect(result.items[1]?.actorRole).toBe('company');
    });

    it('returns empty history when none', async () => {
      mockRepo.findHistoryPage = vi.fn().mockResolvedValue({ found: true, total: 0, items: [] });

      const result = await service.getHistory(applicantId, '507f1f77bcf86cd799439011', 1, 10);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });
  });

  describe('withdraw', () => {
    it('succeeds for submitted application', async () => {
      const id = new mongoose.Types.ObjectId().toString();
      const expectedVersion = 0;
      const reason = 'Found better fit';
      const now = new Date();

      const existing = makeApplicationDoc({
        _id: new mongoose.Types.ObjectId(id),
        applicant_id: new mongoose.Types.ObjectId(applicantId),
        status: 'submitted',
        version: expectedVersion,
        history: [{ status: 'submitted', actor_role: 'candidate', occurred_at: new Date(now.getTime() - 1000) }],
      });

      const withdrawn = makeApplicationDoc({
        ...existing,
        status: 'withdrawn',
        withdrawn_at: now,
        latest_status_at: now,
        withdrawal_reason: reason,
        version: expectedVersion + 1,
        history: [
          ...existing.history,
          { status: 'withdrawn', actor_role: 'candidate', occurred_at: now },
        ],
      });

      mockRepo.findOwnedById = vi.fn().mockResolvedValue(existing);
      mockRepo.withdrawAtomically = vi.fn().mockResolvedValue(withdrawn);

      const result = await service.withdraw(applicantId, id, expectedVersion, reason);

      expect(mockRepo.findOwnedById).toHaveBeenCalledWith(id, applicantId);
      expect(mockRepo.withdrawAtomically).toHaveBeenCalledWith(id, applicantId, expectedVersion, reason);
      expect(result.status).toBe('withdrawn');
      expect(result.withdrawalReason).toBe(reason);
      expect(result.canWithdraw).toBe(false);
      expect(result.version).toBe(expectedVersion + 1);
    });

    it('throws 404 when application not found', async () => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(null);

      await expect(
        service.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, 'reason'),
      ).rejects.toThrow(APPLICATION_MESSAGES.NOT_FOUND);
    });

    it('throws 400 when not in withdrawable status', async () => {
      const existing = makeApplicationDoc({
        _id: new mongoose.Types.ObjectId(),
        applicant_id: new mongoose.Types.ObjectId(applicantId),
        status: 'interviewing',
        version: 0,
      });

      mockRepo.findOwnedById = vi.fn().mockResolvedValue(existing);

      await expect(service.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, 'reason')).rejects.toThrow(
        APPLICATION_MESSAGES.WITHDRAWAL_NOT_ALLOWED,
      );
    });

    it('throws 409 on version mismatch', async () => {
      const existing = makeApplicationDoc({
        _id: new mongoose.Types.ObjectId(),
        applicant_id: new mongoose.Types.ObjectId(applicantId),
        status: 'submitted',
        version: 5,
      });

      mockRepo.findOwnedById = vi.fn().mockResolvedValue(existing);

      await expect(service.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, 'reason')).rejects.toThrow(
        APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT,
      );
    });

    it('throws 409 on atomic update failure (concurrent transition)', async () => {
      const existing = makeApplicationDoc({
        _id: new mongoose.Types.ObjectId(),
        applicant_id: new mongoose.Types.ObjectId(applicantId),
        status: 'submitted',
        version: 0,
      });

      mockRepo.findOwnedById = vi.fn().mockResolvedValue(existing);
      mockRepo.withdrawAtomically = vi.fn().mockResolvedValue(null); // simulates lost race

      await expect(service.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, 'reason')).rejects.toThrow(
        APPLICATION_MESSAGES.WITHDRAWAL_CONFLICT,
      );
    });
  });

  // UC-MYAPP-01.EX.2 / AC-MYAPP-01-05: an account that is not an active candidate gets a non-mutating 403.
  describe('candidate resolution', () => {
    it('rejects an unresolved or inactive candidate without touching storage', async () => {
      const blocked = new ApplicationsService(mockRepo as ApplicationsRepository, { findById: vi.fn().mockResolvedValue(null) } as unknown as UsersService);
      await expect(blocked.list(applicantId, { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc' })).rejects.toMatchObject({ statusCode: 403, message: APPLICATION_MESSAGES.CANDIDATE_UNAVAILABLE });
      expect(mockRepo.findPageByApplicant).not.toHaveBeenCalled();
      const suspended = new ApplicationsService(mockRepo as ApplicationsRepository, { findById: vi.fn().mockResolvedValue({ role: 'user', status: 'suspended' }) } as unknown as UsersService);
      await expect(suspended.getDetail(applicantId, '507f1f77bcf86cd799439011')).rejects.toMatchObject({ statusCode: 403 });
      await expect(suspended.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, undefined)).rejects.toMatchObject({ statusCode: 403 });
      expect(mockRepo.withdrawAtomically).not.toHaveBeenCalled();
    });
  });

  // UC-MYAPP-01.EX.4 / 02.EX.5 / 03.EX.4 / 04.EX.5: storage failures surface as errors; no partial result is mapped.
  describe('storage failures', () => {
    it('propagates retrieval failures for list, detail and history', async () => {
      const failure = new Error('storage down');
      mockRepo.findPageByApplicant = vi.fn().mockRejectedValue(failure);
      mockRepo.countByStatus = vi.fn().mockResolvedValue(createEmptyStatusCounts());
      mockRepo.findOwnedById = vi.fn().mockRejectedValue(failure);
      mockRepo.findHistoryPage = vi.fn().mockRejectedValue(failure);
      await expect(service.list(applicantId, { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc' })).rejects.toBe(failure);
      await expect(service.getDetail(applicantId, '507f1f77bcf86cd799439011')).rejects.toBe(failure);
      await expect(service.getHistory(applicantId, '507f1f77bcf86cd799439011', 1, 10)).rejects.toBe(failure);
    });

    it('does not report a withdrawal when the atomic write fails', async () => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(makeApplicationDoc({ status: 'under_review', version: 1 }));
      mockRepo.withdrawAtomically = vi.fn().mockRejectedValue(new Error('write failed'));
      await expect(service.withdraw(applicantId, '507f1f77bcf86cd799439011', 1, undefined)).rejects.toThrow('write failed');
    });
  });

  // BR-APP-004 / UC-MYAPP-04.EX.3: every status other than Submitted and Under Review is final for the candidate.
  describe('withdrawal eligibility', () => {
    it.each(['interviewing', 'offered', 'hired', 'rejected', 'withdrawn', 'position_filled'] as const)('rejects %s', async (status) => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(makeApplicationDoc({ status, version: 0 }));
      await expect(service.withdraw(applicantId, '507f1f77bcf86cd799439011', 0, undefined)).rejects.toMatchObject({ statusCode: 400, message: APPLICATION_MESSAGES.WITHDRAWAL_NOT_ALLOWED });
      expect(mockRepo.withdrawAtomically).not.toHaveBeenCalled();
    });

    it.each(['submitted', 'under_review'] as const)('marks %s as withdrawable in the DTO', async (status) => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(makeApplicationDoc({ status }));
      expect((await service.getDetail(applicantId, '507f1f77bcf86cd799439011')).canWithdraw).toBe(true);
    });
  });

  // BR-APP-008: apply-again availability and the read-only links between the two records.
  describe('reapplication links', () => {
    const detail = async (overrides: Partial<ApplicationDoc>) => {
      mockRepo.findOwnedById = vi.fn().mockResolvedValue(makeApplicationDoc(overrides));
      return service.getDetail(applicantId, '507f1f77bcf86cd799439011');
    };

    it('offers Apply again for a first withdrawn application on a public job', async () => {
      expect((await detail({ status: 'withdrawn' })).canApplyAgain).toBe(true);
    });

    it('does not offer it once reapplied, for a reapplication, on a closed job, or for other statuses', async () => {
      const replacement = new mongoose.Types.ObjectId();
      expect((await detail({ status: 'withdrawn', reapplied_as: replacement })).canApplyAgain).toBe(false);
      expect((await detail({ status: 'withdrawn', reapplied_from: replacement })).canApplyAgain).toBe(false);
      expect((await detail({ status: 'withdrawn', job_snapshot: { title: 'x', company_name: 'y', public_status: 'closed' } })).canApplyAgain).toBe(false);
      for (const status of ['submitted', 'rejected', 'hired', 'position_filled'] as const) {
        expect((await detail({ status })).canApplyAgain).toBe(false);
      }
    });

    it('exposes both link directions as ids', async () => {
      const from = new mongoose.Types.ObjectId();
      const as = new mongoose.Types.ObjectId();
      expect(await detail({ status: 'submitted', reapplied_from: from })).toMatchObject({ reappliedFrom: String(from), reappliedAs: null });
      expect(await detail({ status: 'withdrawn', reapplied_as: as })).toMatchObject({ reappliedFrom: null, reappliedAs: String(as) });
    });
  });
});
