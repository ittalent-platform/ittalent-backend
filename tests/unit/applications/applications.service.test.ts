import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationDoc, ApplicationStatus } from '../../../src/models/application.model.js';
import { APPLICATION_ERROR_CODES } from '../../../src/modules/applications/applications.constants.js';
import type { ApplicationsRepository } from '../../../src/modules/applications/applications.repository.js';
import { ApplicationsService } from '../../../src/modules/applications/applications.service.js';
import type { DocumentsService } from '../../../src/modules/documents/documents.service.js';
import type { JobPostingsService } from '../../../src/modules/job-postings/job-postings.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

vi.mock('../../../src/shared/services/email.service.js', () => ({
  sendApplicationConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  consumeEmailDeliveryStatus: vi.fn().mockReturnValue(true),
}));

const userId = '507f1f77bcf86cd799439011';
const jobId = '507f1f77bcf86cd799439012';
const cvId = '507f1f77bcf86cd799439013';
const body = { jobPostingId: jobId, cvId };

function application(status: ApplicationStatus, id = '507f1f77bcf86cd7994390aa'): ApplicationDoc {
  return {
    _id: id, job_id: jobId, applicant_id: userId, cv_id: cvId, status, status_history: [],
    createdAt: new Date('2026-09-01T00:00:00.000Z'), updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  } as unknown as ApplicationDoc;
}

describe('ApplicationsService.applyToJob (BR-APP-002 / BR-APP-010)', () => {
  let repository: { findLatestByJobAndApplicant: ReturnType<typeof vi.fn>; countByJobAndApplicant: ReturnType<typeof vi.fn>; countHiredByJobId: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let service: ApplicationsService;

  beforeEach(() => {
    repository = {
      findLatestByJobAndApplicant: vi.fn().mockResolvedValue(null),
      countByJobAndApplicant: vi.fn().mockResolvedValue(1),
      countHiredByJobId: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async (data: { reappliedFrom?: string }) => ({ ...application('submitted', '507f1f77bcf86cd7994390bb'), ...(data.reappliedFrom ? { reapplied_from: data.reappliedFrom } : {}) })),
    };
    service = new ApplicationsService(
      repository as unknown as ApplicationsRepository,
      { findById: vi.fn().mockResolvedValue({ email: 'a@example.com', status: 'active' }) } as unknown as UsersService,
      { findPublicJobById: vi.fn().mockResolvedValue({ _id: jobId, title: 'Engineer', openings: 3 }) } as unknown as JobPostingsService,
      { findOwnedByType: vi.fn().mockResolvedValue({ _id: cvId }) } as unknown as DocumentsService,
    );
  });

  it('creates the first application without a link', async () => {
    const result = await service.applyToJob(userId, body);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ reappliedFrom: undefined }));
    expect(result).toMatchObject({ status: 'submitted', reappliedFrom: null, reappliedAs: null });
  });

  it.each(['submitted', 'under_review', 'interviewing', 'offered'] as const)('rejects a duplicate while the latest is %s', async (status) => {
    repository.findLatestByJobAndApplicant.mockResolvedValue(application(status));
    await expect(service.applyToJob(userId, body)).rejects.toMatchObject({ statusCode: 409, code: APPLICATION_ERROR_CODES.ALREADY_APPLIED });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('never allows applying again after Hired', async () => {
    repository.findLatestByJobAndApplicant.mockResolvedValue(application('hired'));
    await expect(service.applyToJob(userId, body)).rejects.toMatchObject({ statusCode: 409, code: APPLICATION_ERROR_CODES.APPLY_AGAIN_NOT_ALLOWED });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each(['withdrawn', 'rejected'] as const)('creates a NEW linked record after %s and never reopens the old one', async (status) => {
    const closed = application(status);
    repository.findLatestByJobAndApplicant.mockResolvedValue(closed);
    const result = await service.applyToJob(userId, body);
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ reappliedFrom: closed._id }));
    expect(result.id).not.toBe(String(closed._id));
    expect(result).toMatchObject({ status: 'submitted', reappliedFrom: String(closed._id) });
  });

  it('stops after two records for the pair', async () => {
    repository.findLatestByJobAndApplicant.mockResolvedValue(application('withdrawn'));
    repository.countByJobAndApplicant.mockResolvedValue(2);
    await expect(service.applyToJob(userId, body)).rejects.toMatchObject({ statusCode: 409, code: APPLICATION_ERROR_CODES.APPLY_AGAIN_NOT_ALLOWED });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('reports a concurrent winner (unique-index rejection) as already applied', async () => {
    repository.create.mockResolvedValue(null);
    await expect(service.applyToJob(userId, body)).rejects.toMatchObject({ statusCode: 409, code: APPLICATION_ERROR_CODES.ALREADY_APPLIED });
  });

  it('returns the latest record of the pair from findMyApplication', async () => {
    repository.findLatestByJobAndApplicant.mockResolvedValue(application('withdrawn'));
    expect(await service.findMyApplication(userId, jobId)).toMatchObject({ status: 'withdrawn' });
    repository.findLatestByJobAndApplicant.mockResolvedValue(null);
    expect(await service.findMyApplication(userId, jobId)).toBeNull();
  });
});

// ---- UC-MYAPP-01..05: the candidate's own applications ----
describe('ApplicationsService candidate views', () => {
  const jobSummary = { id: jobId, title: 'Frontend Engineer', companyName: 'Nova Fintech', location: 'Hà Nội', employmentType: 'Full-time', expiresAt: new Date('2099-01-01T00:00:00.000Z'), isOpen: true };
  const entry = (status: ApplicationStatus, changedBy: string, at: string) => ({ status, changed_by: changedBy, changed_at: new Date(at) });
  const record = (overrides: Record<string, unknown> = {}): ApplicationDoc => ({
    ...application('submitted'),
    status_history: [entry('submitted', userId, '2026-09-01T10:00:00.000Z')],
    ...overrides,
  }) as unknown as ApplicationDoc;

  let repository: Record<'findPageByApplicant' | 'countByStatus' | 'findOwnedById' | 'findHistoryPage' | 'withdrawAtomically', ReturnType<typeof vi.fn>>;
  let users: { findById: ReturnType<typeof vi.fn> };
  let jobs: { findSummariesByIds: ReturnType<typeof vi.fn>; findIdsByKeyword: ReturnType<typeof vi.fn> };
  let service: ApplicationsService;
  const query = { page: 1, limit: 10, sortBy: 'submittedAt', sortOrder: 'desc' } as const;

  beforeEach(() => {
    repository = {
      findPageByApplicant: vi.fn().mockResolvedValue({ items: [record()], total: 1 }),
      countByStatus: vi.fn().mockResolvedValue({ submitted: 1, under_review: 0, interviewing: 0, offered: 0, hired: 0, rejected: 0, withdrawn: 0 }),
      findOwnedById: vi.fn().mockResolvedValue(record()),
      findHistoryPage: vi.fn(),
      withdrawAtomically: vi.fn(),
    };
    users = { findById: vi.fn().mockResolvedValue({ role: 'user', status: 'active' }) };
    jobs = { findSummariesByIds: vi.fn().mockResolvedValue(new Map([[jobId, jobSummary]])), findIdsByKeyword: vi.fn() };
    service = new ApplicationsService(
      repository as unknown as ApplicationsRepository,
      users as unknown as UsersService,
      jobs as unknown as JobPostingsService,
      { findByIds: vi.fn().mockResolvedValue([{ _id: cvId, type: 'cv', file_name: 'cv.pdf', mime_type: 'application/pdf', size: 10 }]) } as unknown as DocumentsService,
    );
  });

  it('lists with the public job summary, documents and stage label, never account data', async () => {
    const result = await service.list(userId, query);
    expect(result).toMatchObject({ total: 1, totalPages: 1, statusCounts: { submitted: 1 } });
    expect(result.items[0]).toMatchObject({ job: { title: 'Frontend Engineer', companyName: 'Nova Fintech', publicStatus: 'open' }, submittedDocuments: ['cv'], canWithdraw: true, reviewStage: null });
    expect(JSON.stringify(result)).not.toMatch(/changed_by|applicant_id/);
  });

  it('turns several statuses, a stage and a job into repository filters', async () => {
    jobs.findIdsByKeyword.mockResolvedValue([jobId, '507f1f77bcf86cd7994390ff']);
    await service.list(userId, { ...query, status: 'under_review,interviewing,submitted', reviewStage: 'screening', jobId, search: 'nova' });
    expect(repository.findPageByApplicant).toHaveBeenCalledWith(userId, expect.objectContaining({ filters: expect.objectContaining({ statuses: ['under_review'], jobIds: [jobId] }) }));
  });

  it('returns an empty page without querying when the keyword or filters match nothing', async () => {
    jobs.findIdsByKeyword.mockResolvedValue([]);
    expect((await service.list(userId, { ...query, search: 'zzz' })).total).toBe(0);
    expect((await service.list(userId, { ...query, status: 'submitted', reviewStage: 'offer' })).total).toBe(0);
    expect(repository.findPageByApplicant).not.toHaveBeenCalled();
  });

  it('maps statuses to public stage labels', async () => {
    repository.findOwnedById.mockResolvedValue(record({ status: 'interviewing' }));
    expect((await service.getDetail(userId, cvId)).reviewStage).toBe('interview');
    repository.findOwnedById.mockResolvedValue(record({ status: 'submitted' }));
    expect((await service.getDetail(userId, cvId)).reviewStage).toBeNull();
  });

  it('uses the number of history entries as the version and marks the job closed when it is not open', async () => {
    jobs.findSummariesByIds.mockResolvedValue(new Map([[jobId, { ...jobSummary, isOpen: false }]]));
    repository.findOwnedById.mockResolvedValue(record({ status: 'withdrawn', status_history: [entry('submitted', userId, '2026-09-01T10:00:00.000Z'), entry('withdrawn', userId, '2026-09-02T10:00:00.000Z')] }));
    const detail = await service.getDetail(userId, cvId);
    expect(detail).toMatchObject({ version: 2, withdrawnAt: '2026-09-02T10:00:00.000Z', latestStatusAt: '2026-09-02T10:00:00.000Z', canApplyAgain: false });
    expect(detail.job.publicStatus).toBe('closed');
  });

  it('offers Apply again only for a first Withdrawn/Rejected application on an open job', async () => {
    const canApplyAgain = async (overrides: Record<string, unknown>) => { repository.findOwnedById.mockResolvedValue(record(overrides)); return (await service.getDetail(userId, cvId)).canApplyAgain; };
    expect(await canApplyAgain({ status: 'withdrawn' })).toBe(true);
    expect(await canApplyAgain({ status: 'rejected' })).toBe(true);
    expect(await canApplyAgain({ status: 'withdrawn', reapplied_as: cvId })).toBe(false);
    expect(await canApplyAgain({ status: 'withdrawn', reapplied_from: cvId })).toBe(false);
    expect(await canApplyAgain({ status: 'hired' })).toBe(false);
    expect(await canApplyAgain({ status: 'submitted' })).toBe(false);
  });

  it('exposes the actor role only, never the account id', async () => {
    repository.findHistoryPage.mockResolvedValue({ found: true, total: 2, items: [entry('submitted', userId, '2026-09-01T10:00:00.000Z'), entry('under_review', '507f1f77bcf86cd7994390ee', '2026-09-02T10:00:00.000Z')] });
    const history = await service.getHistory(userId, cvId, 1, 20);
    expect(history.items.map((item) => item.actorRole)).toEqual(['candidate', 'company']);
    expect(JSON.stringify(history)).not.toContain('507f1f77bcf86cd7994390ee');
  });

  it('masks another candidate\'s record as not found for detail, history and withdrawal', async () => {
    repository.findOwnedById.mockResolvedValue(null);
    repository.findHistoryPage.mockResolvedValue({ found: false, total: 0, items: [] });
    await expect(service.getDetail(userId, cvId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getHistory(userId, cvId, 1, 20)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.withdraw(userId, cvId, 1, undefined)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects an account that is not an active candidate before touching storage (UC-MYAPP-01.EX.2)', async () => {
    users.findById.mockResolvedValue({ role: 'user', status: 'suspended' });
    await expect(service.list(userId, query)).rejects.toMatchObject({ statusCode: 403 });
    users.findById.mockResolvedValue(null);
    await expect(service.getDetail(userId, cvId)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.findPageByApplicant).not.toHaveBeenCalled();
  });

  it('propagates storage failures without a partial result and never reports a failed withdrawal', async () => {
    repository.findPageByApplicant.mockRejectedValue(new Error('down'));
    await expect(service.list(userId, query)).rejects.toThrow('down');
    repository.findOwnedById.mockResolvedValue(record());
    repository.withdrawAtomically.mockRejectedValue(new Error('write failed'));
    await expect(service.withdraw(userId, cvId, 1, undefined)).rejects.toThrow('write failed');
  });

  describe('withdraw', () => {
    it('withdraws a Submitted or Under Review application with the version the client saw', async () => {
      for (const status of ['submitted', 'under_review'] as const) {
        repository.findOwnedById.mockResolvedValue(record({ status }));
        repository.withdrawAtomically.mockResolvedValue(record({ status: 'withdrawn', withdrawal_reason: 'found another job', status_history: [entry('submitted', userId, '2026-09-01T10:00:00.000Z'), entry('withdrawn', userId, '2026-09-03T10:00:00.000Z')] }));
        const result = await service.withdraw(userId, cvId, 1, 'found another job');
        expect(repository.withdrawAtomically).toHaveBeenLastCalledWith(cvId, userId, 1, 'found another job');
        expect(result).toMatchObject({ status: 'withdrawn', withdrawalReason: 'found another job', canWithdraw: false, version: 2 });
      }
    });

    it.each(['interviewing', 'offered', 'hired', 'rejected', 'withdrawn'] as const)('refuses %s with 400 and changes nothing', async (status) => {
      repository.findOwnedById.mockResolvedValue(record({ status }));
      await expect(service.withdraw(userId, cvId, 1, undefined)).rejects.toMatchObject({ statusCode: 400 });
      expect(repository.withdrawAtomically).not.toHaveBeenCalled();
    });

    it('reports a stale version or a lost race as 409', async () => {
      repository.findOwnedById.mockResolvedValue(record());
      await expect(service.withdraw(userId, cvId, 5, undefined)).rejects.toMatchObject({ statusCode: 409 });
      repository.withdrawAtomically.mockResolvedValue(null);
      await expect(service.withdraw(userId, cvId, 1, undefined)).rejects.toMatchObject({ statusCode: 409 });
    });
  });
});
