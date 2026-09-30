import { describe, expect, it, vi } from 'vitest';

import type { JobPostingDoc } from '../../../src/models/job-posting.model.js';
import type { JobPostingsRepository } from '../../../src/modules/job-postings/job-postings.repository.js';
import { JobPostingsService } from '../../../src/modules/job-postings/job-postings.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

const enterpriseA = '507f1f77bcf86cd799439011';
const enterpriseB = '507f1f77bcf86cd799439012';
const recruiterA1 = '507f1f77bcf86cd799439021';
const recruiterA2 = '507f1f77bcf86cd799439022';
const admin = '507f1f77bcf86cd799439099';
const jobId = '507f1f77bcf86cd799439031';

function jobPosting(enterpriseId: string, overrides: Record<string, unknown> = {}): JobPostingDoc {
  const base = {
    _id: jobId,
    enterprise_id: enterpriseId,
    posted_by_user_id: recruiterA1,
    title: 'Backend Engineer', slug: 'backend-engineer', currency: 'VND', status: 'published',
    description: 'Build reliable services for enterprise customers.', requirements: 'Node.js and TypeScript experience', benefits: 'Flexible working hours and health cover',
    location: 'Ho Chi Minh City', employment_type: 'Full-time', expires_at: new Date('2099-01-01T16:59:59.999Z'),
    ...overrides,
  };
  return { ...base, toObject: () => ({ ...base, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') }) } as unknown as JobPostingDoc;
}

type MockRepository = Record<'create' | 'findById' | 'findBySlug' | 'update' | 'delete' | 'list' | 'isEnterpriseActive' | 'recordAudit' | 'restore' | 'markDeleting' | 'clearDeleting' | 'hasApplications' | 'findActiveEnterpriseIds', ReturnType<typeof vi.fn>>;

function createService(recruiterEnterpriseId: string | null): { service: JobPostingsService; repository: MockRepository } {
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn().mockResolvedValue(null),
    findEnterpriseSummaries: vi.fn().mockResolvedValue(new Map([[enterpriseA, { id: enterpriseA, name: 'Enterprise A', logoUrl: null }], [enterpriseB, { id: enterpriseB, name: 'Enterprise B', logoUrl: null }]])),
    countApplicationsByJobIds: vi.fn().mockResolvedValue(new Map()),
    isEnterpriseActive: vi.fn().mockResolvedValue(true),
    findActiveEnterpriseIds: vi.fn().mockResolvedValue([enterpriseA]),
    recordAudit: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    markDeleting: vi.fn(),
    clearDeleting: vi.fn().mockResolvedValue(undefined),
    hasApplications: vi.fn().mockResolvedValue(false),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue(true),
    list: vi.fn(),
  };
  const userService = { getEnterpriseId: vi.fn().mockResolvedValue(recruiterEnterpriseId) };
  return { service: new JobPostingsService(repository as unknown as JobPostingsRepository, userService as unknown as UsersService), repository };
}

const createInput = {
  title: 'Backend Engineer',
  location: 'Ho Chi Minh City',
  employment_type: 'Full-time' as const,
  description: 'Build reliable services for enterprise customers.',
  requirements: 'Node.js and TypeScript experience',
  benefits: 'Flexible working hours and health cover',
  expires_at: '2099-01-01',
};
const listQuery = { sort_by: 'created_at' as const, sort_order: 'desc' as const, page: 1, limit: 20 };

describe('JobPostingsService enterprise ownership', () => {
  it('assigns the authenticated recruiter enterprise on create and publishes with an end-of-day deadline', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.create.mockResolvedValue(jobPosting(enterpriseA));
    await service.create(recruiterA1, createInput);
    expect(repository.create).toHaveBeenCalledWith(recruiterA1, enterpriseA, createInput, 'backend-engineer', new Date('2099-01-01T16:59:59.999Z'));
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'create', result: 'success' }));
  });

  it('filters recruiter management list by enterprise on the repository query', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.list.mockResolvedValue({ items: [], total: 0 });
    await service.listRecruiter(recruiterA1, listQuery);
    expect(repository.list).toHaveBeenCalledWith(listQuery, { publicOnly: false, enterpriseId: enterpriseA });
  });

  it('forbids a recruiter from viewing a job posting of another enterprise', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseB));
    await expect(service.getByIdForManagement(jobId, recruiterA1, 'recruiter')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('forbids a recruiter from updating a job posting of another enterprise', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseB));
    await expect(service.update(jobId, recruiterA1, 'recruiter', { title: 'New title' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows another recruiter in the same enterprise to update the job posting and audits it', async () => {
    const { service, repository } = createService(enterpriseA);
    const existing = jobPosting(enterpriseA);
    repository.findById.mockResolvedValue(existing);
    repository.update.mockResolvedValue(jobPosting(enterpriseA, { title: 'Platform Engineer' }));
    await service.update(jobId, recruiterA2, 'recruiter', { title: 'Platform Engineer' });
    expect(repository.update).toHaveBeenCalled();
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'update', changed_fields: ['title'] }));
  });

  it('rejects a recruiter without an enterprise on create and list', async () => {
    const { service, repository } = createService(null);
    await expect(service.create(recruiterA1, createInput)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listRecruiter(recruiterA1, listQuery)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('JobPostingsService business rules', () => {
  it('rejects publishing when the enterprise is not Active (UC-JOB-01.EX.1)', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.isEnterpriseActive.mockResolvedValue(false);
    await expect(service.create(recruiterA1, createInput)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a deadline before today (AC-JOB-01-04)', async () => {
    const { service, repository } = createService(enterpriseA);
    await expect(service.create(recruiterA1, { ...createInput, expires_at: '2020-01-01' })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('undoes a created job and reports a retryable failure when the audit cannot be written (AC-JOB-01-06)', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.create.mockResolvedValue(jobPosting(enterpriseA));
    repository.recordAudit.mockRejectedValue(new Error('audit down'));
    await expect(service.create(recruiterA1, createInput)).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.delete).toHaveBeenCalledWith(jobId);
  });

  it('does not let the admin change or delete company jobs', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseA));
    await expect(service.update(jobId, admin, 'admin', { title: 'Admin edit' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.remove(jobId, admin, 'admin')).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.update).not.toHaveBeenCalled();
    expect(repository.markDeleting).not.toHaveBeenCalled();
  });

  it('keeps a legacy archived posting read-only', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseA, { status: 'archived' }));
    await expect(service.update(jobId, recruiterA1, 'recruiter', { title: 'Late edit' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('only accepts a changed deadline that is today or later, but leaves an unchanged expired one alone', async () => {
    const { service, repository } = createService(enterpriseA);
    const existing = jobPosting(enterpriseA, { expires_at: new Date('2020-01-01T16:59:59.999Z') });
    repository.findById.mockResolvedValue(existing);
    repository.update.mockResolvedValue(existing);
    await expect(service.update(jobId, recruiterA1, 'recruiter', { expires_at: '2020-06-01' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.update(jobId, recruiterA1, 'recruiter', { expires_at: '2020-01-01' })).resolves.toBeDefined();
  });
});

describe('JobPostingsService delete (UC-JOB-03)', () => {
  it('flags the job, deletes it when no application exists and records a separate audit event', async () => {
    const { service, repository } = createService(enterpriseA);
    const job = jobPosting(enterpriseA);
    repository.findById.mockResolvedValue(job);
    repository.markDeleting.mockResolvedValue(job);
    await service.remove(jobId, recruiterA1, 'recruiter');
    expect(repository.markDeleting).toHaveBeenCalledWith(jobId);
    expect(repository.delete).toHaveBeenCalledWith(jobId);
    expect(repository.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'delete', job_title: 'Backend Engineer' }));
  });

  it('keeps the job, clears the flag and records no success audit when an application exists', async () => {
    const { service, repository } = createService(enterpriseA);
    const job = jobPosting(enterpriseA);
    repository.findById.mockResolvedValue(job);
    repository.markDeleting.mockResolvedValue(job);
    repository.hasApplications.mockResolvedValue(true);
    await expect(service.remove(jobId, recruiterA1, 'recruiter')).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.clearDeleting).toHaveBeenCalledWith(jobId);
    expect(repository.recordAudit).not.toHaveBeenCalled();
  });

  it('puts the job back and fails when the delete audit cannot be written (AC-JOB-03-07)', async () => {
    const { service, repository } = createService(enterpriseA);
    const job = jobPosting(enterpriseA);
    repository.findById.mockResolvedValue(job);
    repository.markDeleting.mockResolvedValue(job);
    repository.recordAudit.mockRejectedValue(new Error('audit down'));
    await expect(service.remove(jobId, recruiterA1, 'recruiter')).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.restore).toHaveBeenCalled();
  });

  it('rejects a second delete while one is already in progress', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseA));
    repository.markDeleting.mockResolvedValue(null);
    await expect(service.remove(jobId, recruiterA1, 'recruiter')).rejects.toMatchObject({ statusCode: 409 });
  });
});
