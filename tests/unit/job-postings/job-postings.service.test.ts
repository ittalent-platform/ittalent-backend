import { describe, expect, it, vi } from 'vitest';

import type { JobPostingDoc } from '../../../src/models/job-posting.model.js';
import type { JobPostingsRepository } from '../../../src/modules/job-postings/job-postings.repository.js';
import { JobPostingsService } from '../../../src/modules/job-postings/job-postings.service.js';
import type { UsersService } from '../../../src/modules/users/users.service.js';

const enterpriseA = '507f1f77bcf86cd799439011';
const enterpriseB = '507f1f77bcf86cd799439012';
const recruiterA1 = '507f1f77bcf86cd799439021';
const recruiterA2 = '507f1f77bcf86cd799439022';

function jobPosting(enterpriseId: string, postedByUserId = recruiterA1): JobPostingDoc {
  return {
    _id: '507f1f77bcf86cd799439031',
    enterprise_id: enterpriseId,
    posted_by_user_id: postedByUserId,
    title: 'Backend Engineer', slug: 'backend-engineer', currency: 'VND', status: 'draft',
    toObject: () => ({ createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z') }),
  } as unknown as JobPostingDoc;
}

type MockRepository = {
  create: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findBySlug: ReturnType<typeof vi.fn>;
  findEnterpriseSummaries: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

function createService(recruiterEnterpriseId: string | null): { service: JobPostingsService; repository: MockRepository } {
  const repository = {
    create: vi.fn(),
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findEnterpriseSummaries: vi.fn().mockResolvedValue(new Map([[enterpriseA, { id: enterpriseA, name: 'Enterprise A', logoUrl: null }], [enterpriseB, { id: enterpriseB, name: 'Enterprise B', logoUrl: null }]])),
    update: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
  const userService = { getEnterpriseId: vi.fn().mockResolvedValue(recruiterEnterpriseId) };
  return { service: new JobPostingsService(repository as unknown as JobPostingsRepository, userService as unknown as UsersService), repository };
}

const createInput = { title: 'Backend Engineer' };
const listQuery = { sort_by: 'created_at' as const, sort_order: 'desc' as const, page: 1, limit: 20 };

describe('JobPostingsService enterprise ownership', () => {
  it('assigns the authenticated recruiter enterprise on create', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findBySlug.mockResolvedValue(null);
    repository.create.mockResolvedValue(jobPosting(enterpriseA));
    await service.create(recruiterA1, createInput);
    expect(repository.create).toHaveBeenCalledWith(recruiterA1, enterpriseA, createInput, 'backend-engineer');
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
    await expect(service.getByIdForManagement('507f1f77bcf86cd799439031', recruiterA1, 'recruiter')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('forbids a recruiter from updating a job posting of another enterprise', async () => {
    const { service, repository } = createService(enterpriseA);
    repository.findById.mockResolvedValue(jobPosting(enterpriseB));
    await expect(service.update('507f1f77bcf86cd799439031', recruiterA1, 'recruiter', { title: 'New title' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows another recruiter in the same enterprise to update the job posting', async () => {
    const { service, repository } = createService(enterpriseA);
    const existing = jobPosting(enterpriseA, recruiterA1);
    repository.findById.mockResolvedValue(existing);
    repository.update.mockResolvedValue({ ...existing, title: 'Platform Engineer' });
    await service.update('507f1f77bcf86cd799439031', recruiterA2, 'recruiter', { title: 'Platform Engineer' });
    expect(repository.update).toHaveBeenCalled();
  });

  it('rejects a recruiter without an enterprise on create and list', async () => {
    const { service, repository } = createService(null);
    await expect(service.create(recruiterA1, createInput)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listRecruiter(recruiterA1, listQuery)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });
});
