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
