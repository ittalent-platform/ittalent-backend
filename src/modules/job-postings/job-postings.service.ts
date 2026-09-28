import { HTTP_STATUS } from '../../shared/constants/http-status.js';
import { createHttpError } from '../../shared/errors/http-error.js';
import type { JobPostingDoc } from '../../models/job-posting.model.js';
import { jobPostingsRepository, type JobPostingsRepository } from './job-postings.repository.js';
import type { CreateJobPosting, JobPostingListQuery, JobPostingResponse, UpdateJobPosting } from './job-postings.schemas.js';

const PUBLISHED_DESCRIPTION_MIN_LENGTH = 20;

function slugify(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `job-${Date.now()}`; }

export class JobPostingsService {
  constructor(private readonly repository: JobPostingsRepository = jobPostingsRepository) {}
  private map(record: JobPostingDoc): JobPostingResponse { const raw = record.toObject(); return { id: String(record._id), postedByUserId: String(record.posted_by_user_id), title: record.title, slug: record.slug, ...(record.location ? { location: record.location } : {}), ...(record.employment_type ? { employmentType: record.employment_type } : {}), ...(record.salary_min !== undefined ? { salaryMin: record.salary_min } : {}), ...(record.salary_max !== undefined ? { salaryMax: record.salary_max } : {}), currency: record.currency, ...(record.level ? { level: record.level } : {}), ...(record.description ? { description: record.description } : {}), ...(record.requirements ? { requirements: record.requirements } : {}), ...(record.benefits ? { benefits: record.benefits } : {}), ...(record.openings !== undefined ? { openings: record.openings } : {}), status: record.status, ...(record.expires_at ? { expiresAt: record.expires_at.toISOString() } : {}), createdAt: new Date(raw.createdAt).toISOString(), updatedAt: new Date(raw.updatedAt).toISOString() }; }
  private async uniqueSlug(title: string, exceptId?: string): Promise<string> { const base = slugify(title); let slug = base; let suffix = 2; while (await this.repository.findBySlug(slug, exceptId)) { slug = `${base}-${suffix}`; suffix += 1; } return slug; }
  async create(userId: string, input: CreateJobPosting): Promise<JobPostingResponse> { return this.map(await this.repository.create(userId, input, await this.uniqueSlug(input.title))); }
  async getById(id: string): Promise<JobPostingResponse> { const jobPosting = await this.repository.findById(id); if (!jobPosting) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Job posting not found'); return this.map(jobPosting); }
  async update(id: string, input: UpdateJobPosting): Promise<JobPostingResponse> { const existing = await this.repository.findById(id); if (!existing) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Job posting not found'); const candidate = { ...existing.toObject(), ...input }; if (input.status === 'published' && (!candidate.description || candidate.description.length < PUBLISHED_DESCRIPTION_MIN_LENGTH || !candidate.requirements || !candidate.benefits || !candidate.location || !candidate.employment_type || !candidate.expires_at)) throw createHttpError(HTTP_STATUS.HTTP_400_BAD_REQUEST, 'Published job posting requires description, requirements, benefits, location, employment type, and expiry'); const updated = await this.repository.update(id, input, input.title ? await this.uniqueSlug(input.title, id) : undefined); if (!updated) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Job posting not found'); return this.map(updated); }
  async remove(id: string): Promise<void> { if (!(await this.repository.delete(id))) throw createHttpError(HTTP_STATUS.HTTP_404_NOT_FOUND, 'Job posting not found'); }
  async list(query: JobPostingListQuery, publicOnly: boolean): Promise<{ items: JobPostingResponse[]; page: number; limit: number; total: number; totalPages: number }> { const result = await this.repository.list(query, publicOnly); return { items: result.items.map((item) => this.map(item)), page: query.page, limit: query.limit, total: result.total, totalPages: Math.ceil(result.total / query.limit) }; }
}
export const jobPostingsService = new JobPostingsService();
