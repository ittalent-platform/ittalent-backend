import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type { PaginatedResult } from '../../shared/schemas/pagination.schema.js';
import { JOB_POSTING_MESSAGES } from './job-postings.constants.js';
import {
  jobPostingsRepository,
  type JobPostingsRepository,
  type PublicJobDetailDoc,
  type PublicJobListDoc,
} from './job-postings.repository.js';
import type {
  JobPostingDetailDTO,
  JobPostingListQuery,
  JobPostingSummaryDTO,
} from './job-postings.schemas.js';

export class JobPostingsService {
  constructor(private readonly repository: JobPostingsRepository = jobPostingsRepository) {}

  private mapSummary(job: PublicJobListDoc): JobPostingSummaryDTO {
    return {
      id: String(job._id),
      enterpriseId: String(job.enterprise_id),
      title: job.title,
      location: job.location ?? null,
      employmentType: job.employment_type ?? null,
      level: job.level ?? null,
      salaryMin: job.salary_min ?? null,
      salaryMax: job.salary_max ?? null,
      currency: job.currency ?? null,
      postedAt: job.createdAt.toISOString(),
    };
  }

  private mapDetail(job: PublicJobDetailDoc): JobPostingDetailDTO {
    return {
      ...this.mapSummary(job),
      description: job.description ?? null,
      requirements: job.requirements ?? null,
      benefits: job.benefits ?? null,
      openings: job.openings,
      deadline: job.deadline ? job.deadline.toISOString() : null,
    };
  }

  async listJobPostings(query: JobPostingListQuery): Promise<PaginatedResult<JobPostingSummaryDTO>> {
    const { items, total } = await this.repository.findPublicPage(query.page, query.limit);

    return {
      items: items.map((job) => this.mapSummary(job)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    };
  }

  async getJobPostingById(id: string): Promise<JobPostingDetailDTO> {
    const job = await this.findPublicJobById(id);

    if (!job) {
      throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, JOB_POSTING_MESSAGES.NOT_FOUND);
    }

    return this.mapDetail(job);
  }

  // Also used by the applications module: a job can be applied to only while Published + Open.
  async findPublicJobById(id: string): Promise<PublicJobDetailDoc | null> {
    return this.repository.findPublicById(id);
  }
}

export const jobPostingsService = new JobPostingsService();