import type { JobPostingDoc } from '../../models/job-posting.model.js';
import { Application } from '../../models/application.model.js';
import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import { usersService, type UsersService } from '../users/users.service.js';
import {
  jobPostingsRepository,
  type JobPostingsRepository,
} from './job-postings.repository.js';
import { JOB_POSTING_MESSAGES } from './job-postings.constants.js';
import type {
  CreateJobPosting,
  JobPostingListQuery,
  JobPostingEnterpriseSummary,
  JobPostingResponse,
  UpdateJobPosting,
} from './job-postings.schemas.js';

const PUBLISHED_DESCRIPTION_MIN_LENGTH = 20;

// What an application shows about its job. `isOpen` = Published and not past its expiry date.
export interface JobSummary {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  employmentType: string | null;
  expiresAt: Date | null;
  isOpen: boolean;
}
type PaginatedJobPostings = {
  items: JobPostingResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `job-${Date.now()}`
  );
}

export class JobPostingsService {
  constructor(
    private readonly repository: JobPostingsRepository = jobPostingsRepository,
    private readonly userService: UsersService = usersService,
  ) {}
  private map(
    record: JobPostingDoc,
    enterprise: JobPostingEnterpriseSummary,
  ): JobPostingResponse {
    const raw = record.toObject();
    return {
      id: String(record._id),
      enterpriseId: String(record.enterprise_id),
      enterprise,
      postedByUserId: String(record.posted_by_user_id),
      title: record.title,
      slug: record.slug,
      ...(record.location ? { location: record.location } : {}),
      ...(record.employment_type
        ? { employmentType: record.employment_type }
        : {}),
      ...(record.salary_min !== undefined
        ? { salaryMin: record.salary_min }
        : {}),
      ...(record.salary_max !== undefined
        ? { salaryMax: record.salary_max }
        : {}),
      salaryNegotiable: record.salary_negotiable ?? false,
      currency: record.currency,
      ...(record.level ? { level: record.level } : {}),
      ...(record.description ? { description: record.description } : {}),
      ...(record.requirements ? { requirements: record.requirements } : {}),
      ...(record.benefits ? { benefits: record.benefits } : {}),
      ...(record.openings !== undefined ? { openings: record.openings } : {}),
      status: record.status,
      ...(record.expires_at
        ? { expiresAt: record.expires_at.toISOString() }
        : {}),
      createdAt: new Date(raw.createdAt).toISOString(),
      updatedAt: new Date(raw.updatedAt).toISOString(),
    };
  }
  private async mapOne(record: JobPostingDoc): Promise<JobPostingResponse> {
    const enterpriseId = String(record.enterprise_id);
    const enterprise = (await this.repository.findEnterpriseSummaries([enterpriseId])).get(enterpriseId);
    if (!enterprise)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Enterprise not found for job posting',
      );
    return this.map(record, enterprise);
  }
  private async uniqueSlug(title: string, exceptId?: string): Promise<string> {
    const base = slugify(title);
    let slug = base;
    let suffix = 2;
    while (await this.repository.findBySlug(slug, exceptId)) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }
  private async getRecruiterEnterpriseId(recruiterId: string): Promise<string> {
    const enterpriseId = await this.userService.getEnterpriseId(recruiterId);
    if (!enterpriseId)
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Recruiter is not assigned to an enterprise',
      );
    return enterpriseId;
  }
  private async assertRecruiterCanManage(
    jobPosting: JobPostingDoc,
    recruiterId: string,
  ): Promise<void> {
    if (
      String(jobPosting.enterprise_id) !==
      (await this.getRecruiterEnterpriseId(recruiterId))
    )
      throw createHttpError(
        HTTP_STATUS.HTTP_403_FORBIDDEN,
        'Job posting belongs to another enterprise',
      );
  }
  private async getExisting(id: string): Promise<JobPostingDoc> {
    const jobPosting = await this.repository.findById(id);
    if (!jobPosting)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Job posting not found',
      );
    return jobPosting;
  }
  async create(
    recruiterId: string,
    input: CreateJobPosting,
  ): Promise<JobPostingResponse> {
    const enterpriseId = await this.getRecruiterEnterpriseId(recruiterId);
    return this.mapOne(
      await this.repository.create(
        recruiterId,
        enterpriseId,
        input,
        await this.uniqueSlug(input.title),
      ),
    );
  }
  async getByIdForManagement(
    id: string,
    actorId: string,
    actorRole: string,
  ): Promise<JobPostingResponse> {
    const jobPosting = await this.getExisting(id);
    if (actorRole === 'recruiter')
      await this.assertRecruiterCanManage(jobPosting, actorId);
    return this.mapOne(jobPosting);
  }
  async update(
    id: string,
    actorId: string,
    actorRole: string,
    input: UpdateJobPosting,
  ): Promise<JobPostingResponse> {
    const existing = await this.getExisting(id);
    if (actorRole === 'recruiter')
      await this.assertRecruiterCanManage(existing, actorId);
    const candidate = { ...existing.toObject(), ...input };
    if (
      candidate.status === 'published' &&
      (!candidate.description ||
        candidate.description.length < PUBLISHED_DESCRIPTION_MIN_LENGTH ||
        !candidate.requirements ||
        !candidate.benefits ||
        !candidate.location ||
        !candidate.employment_type ||
        !candidate.expires_at)
    )
      throw createHttpError(
        HTTP_STATUS.HTTP_400_BAD_REQUEST,
        'Published job posting requires description, requirements, benefits, location, employment type, and expiry',
      );
    const updated = await this.repository.update(
      id,
      input,
      input.title ? await this.uniqueSlug(input.title, id) : undefined,
    );
    if (!updated)
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Job posting not found',
      );
    return this.mapOne(updated);
  }
  async remove(id: string, actorId: string, actorRole: string): Promise<void> {
    const jobPosting = await this.getExisting(id);
    if (actorRole === 'recruiter')
      await this.assertRecruiterCanManage(jobPosting, actorId);
    if (await Application.exists({ job_id: jobPosting._id }))
      throw createHttpError(
        HTTP_STATUS.HTTP_409_CONFLICT,
        JOB_POSTING_MESSAGES.CANNOT_DELETE_WITH_APPLICATIONS,
      );
    if (!(await this.repository.delete(id)))
      throw createHttpError(
        HTTP_STATUS.HTTP_404_NOT_FOUND,
        'Job posting not found',
      );
  }
  // async remove(id: string, actorId: string, actorRole: string): Promise<void> { const jobPosting = await this.getExisting(id); if (actorRole === 'recruiter') await this.assertRecruiterCanManage(jobPosting, actorId); if (!(await this.repository.delete(id))) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Job posting not found'); }
  async findSummariesByIds(ids: string[]): Promise<Map<string, JobSummary>> {
    const jobs = await this.repository.findManyByIds(ids);
    const names = await this.repository.findEnterpriseNames([
      ...new Set(jobs.map((job) => String(job.enterprise_id))),
    ]);
    const now = Date.now();
    return new Map(
      jobs.map((job) => [
        String(job._id),
        {
          id: String(job._id),
          title: job.title,
          companyName: names.get(String(job.enterprise_id)) ?? '',
          location: job.location ?? null,
          employmentType: job.employment_type ?? null,
          expiresAt: job.expires_at ?? null,
          isOpen:
            job.status === 'published' &&
            (!job.expires_at || job.expires_at.getTime() > now),
        },
      ]),
    );
  }
  async findIdsByKeyword(keyword: string): Promise<string[]> {
    return this.repository.findIdsByKeyword(keyword);
  }
  // Returns the job only when it is Published and still open for applications.
  async findPublicJobById(id: string): Promise<JobPostingDoc | null> {
    return this.repository.findOpenPublishedById(id, new Date());
  }
  async listPublic(query: JobPostingListQuery): Promise<PaginatedJobPostings> {
    return this.list(query, { publicOnly: true });
  }
  async listAdmin(query: JobPostingListQuery): Promise<PaginatedJobPostings> {
    return this.list(query, { publicOnly: false });
  }
  async listRecruiter(
    recruiterId: string,
    query: JobPostingListQuery,
  ): Promise<PaginatedJobPostings> {
    return this.list(query, {
      publicOnly: false,
      enterpriseId: await this.getRecruiterEnterpriseId(recruiterId),
    });
  }
  private async list(
    query: JobPostingListQuery,
    options: { publicOnly: boolean; enterpriseId?: string },
  ): Promise<PaginatedJobPostings> {
    const result = await this.repository.list(query, options);
    const enterprises = await this.repository.findEnterpriseSummaries(
      [...new Set(result.items.map((item) => String(item.enterprise_id)))],
    );
    return {
      items: result.items.map((item) => {
        const enterpriseId = String(item.enterprise_id);
        const enterprise = enterprises.get(enterpriseId);
        if (!enterprise)
          throw createHttpError(
            HTTP_STATUS.HTTP_404_NOT_FOUND,
            'Enterprise not found for job posting',
          );
        return this.map(item, enterprise);
      }),
      page: query.page,
      limit: query.limit,
      total: result.total,
      totalPages: Math.ceil(result.total / query.limit),
    };
  }
}
export const jobPostingsService = new JobPostingsService();
