import { JobPosting, type JobPostingData, type JobPostingDoc } from '../../models/job-posting.model.js';
import type { CreateJobPosting, JobPostingListQuery, UpdateJobPosting } from './job-postings.schemas.js';

export class JobPostingsRepository {
  async create(userId: string, enterpriseId: string, input: CreateJobPosting, slug: string): Promise<JobPostingDoc> {
    return new JobPosting({ enterprise_id: enterpriseId, posted_by_user_id: userId, title: input.title, slug, ...this.fields(input) }).save();
  }
  async findById(id: string): Promise<JobPostingDoc | null> { return JobPosting.findById(id).exec(); }
  // A job accepts applications only while it is Published and not past its expiry date.
  async findOpenPublishedById(id: string, now: Date): Promise<JobPostingDoc | null> {
    return JobPosting.findOne({
      _id: id,
      status: 'published',
      $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
    }).exec();
  }
  async findBySlug(slug: string, exceptId?: string): Promise<JobPostingDoc | null> { return JobPosting.findOne({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).exec(); }
  async update(id: string, input: UpdateJobPosting, slug?: string): Promise<JobPostingDoc | null> { return JobPosting.findByIdAndUpdate(id, { $set: { ...this.fields(input), ...(slug ? { slug } : {}) } }, { returnDocument: 'after' }).exec(); }
  async delete(id: string): Promise<boolean> { return (await JobPosting.deleteOne({ _id: id }).exec()).deletedCount === 1; }
  async list(query: JobPostingListQuery, options: { publicOnly: boolean; enterpriseId?: string }): Promise<{ items: JobPostingDoc[]; total: number }> {
    const filter: Record<string, unknown> = { ...(options.publicOnly ? { status: 'published' } : {}), ...(query.status && !options.publicOnly ? { status: query.status } : {}), ...(options.enterpriseId ? { enterprise_id: options.enterpriseId } : {}), ...(query.location ? { location: new RegExp(query.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {}), ...(query.employment_type ? { employment_type: query.employment_type } : {}), ...(query.level ? { level: query.level } : {}) };
    if (query.search) { const pattern = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ title: pattern }, { description: pattern }, { location: pattern }]; }
    const field = query.sort_by === 'created_at' ? 'createdAt' : query.sort_by;
    const direction = query.sort_order === 'asc' ? 1 : -1;
    const [items, total] = await Promise.all([JobPosting.find(filter).sort({ [field]: direction, _id: direction }).skip((query.page - 1) * query.limit).limit(query.limit).exec(), JobPosting.countDocuments(filter).exec()]);
    return { items, total };
  }
  private fields(input: CreateJobPosting | UpdateJobPosting): Partial<JobPostingData> { const result: Partial<JobPostingData> = {}; if (input.title !== undefined) result.title = input.title; if (input.location !== undefined) result.location = input.location; if (input.employment_type !== undefined) result.employment_type = input.employment_type; if (input.salary_min !== undefined) result.salary_min = input.salary_min; if (input.salary_max !== undefined) result.salary_max = input.salary_max; if (input.currency !== undefined) result.currency = input.currency; if (input.level !== undefined) result.level = input.level; if (input.description !== undefined) result.description = input.description; if (input.requirements !== undefined) result.requirements = input.requirements; if (input.benefits !== undefined) result.benefits = input.benefits; if (input.openings !== undefined) result.openings = input.openings; if (input.status !== undefined) result.status = input.status; if (input.expires_at !== undefined) result.expires_at = new Date(input.expires_at); if (input.status === 'published') result.published_at = new Date(); if (input.status === 'archived') result.archived_at = new Date(); return result; }
}
export const jobPostingsRepository = new JobPostingsRepository();
