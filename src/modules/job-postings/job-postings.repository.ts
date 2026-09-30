import { Application } from '../../models/application.model.js';
import { Types } from 'mongoose';
import { Enterprise } from '../../models/enterprise.model.js';
import { JobPostingAuditEvent, type JobPostingAuditEventData } from '../../models/job-posting-audit.model.js';
import {
  JobPosting,
  type JobPostingData,
  type JobPostingDoc,
} from '../../models/job-posting.model.js';
import type {
  CreateJobPosting,
  JobPostingEnterpriseSummary,
  JobPostingListQuery,
  UpdateJobPosting,
} from './job-postings.schemas.js';

// Not past its expiry date: no expiry set, or expiry still in the future.
const notExpired = (now: Date): Record<string, unknown> => ({
  $or: [{ expires_at: { $exists: false } }, { expires_at: null }, { expires_at: { $gt: now } }],
});

export class JobPostingsRepository {
  // Creating always publishes (Sprint 1 has no Draft choice); `expiresAt` is the already-normalised deadline.
  async create(
    userId: string,
    enterpriseId: string,
    input: CreateJobPosting,
    slug: string,
    expiresAt: Date,
  ): Promise<JobPostingDoc> {
    const rest = this.withoutDeadline(input);
    return new JobPosting({
      enterprise_id: enterpriseId,
      posted_by_user_id: userId,
      slug,
      ...this.fields(rest),
      // Saving always publishes (no Draft in Sprint 1).
      status: 'published',
      published_at: new Date(),
      expires_at: expiresAt,
    }).save();
  }
  async findById(id: string): Promise<JobPostingDoc | null> {
    return JobPosting.findById(id).exec();
  }
  // Any state: an application keeps showing its job after the posting closes or expires.
  async findManyByIds(ids: string[]): Promise<JobPostingDoc[]> {
    return JobPosting.find({ _id: { $in: ids } }).exec();
  }
  async findEnterpriseNames(ids: string[]): Promise<Map<string, string>> {
    const enterprises = await Enterprise.find(
      { _id: { $in: ids } },
      { name: 1 },
    )
      .lean()
      .exec();
    return new Map(
      enterprises.map((enterprise) => [
        String(enterprise._id),
        enterprise.name,
      ]),
    );
  }
  async findEnterpriseSummaries(
    ids: string[],
  ): Promise<Map<string, JobPostingEnterpriseSummary>> {
    const enterprises = await Enterprise.find(
      { _id: { $in: ids } },
      { name: 1, logo_url: 1 },
    )
      .lean()
      .exec();
    return new Map(
      enterprises.map((enterprise) => [
        String(enterprise._id),
        {
          id: String(enterprise._id),
          name: enterprise.name,
          logoUrl: enterprise.logo_url ?? null,
        },
      ]),
    );
  }
  // Ids of jobs whose title or enterprise name contains the keyword (case-insensitive), for application search.
  async findIdsByKeyword(keyword: string): Promise<string[]> {
    const pattern = new RegExp(
      keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    const enterpriseIds = (
      await Enterprise.find({ name: pattern }, { _id: 1 }).lean().exec()
    ).map((enterprise) => enterprise._id);
    const jobs = await JobPosting.find(
      { $or: [{ title: pattern }, { enterprise_id: { $in: enterpriseIds } }] },
      { _id: 1 },
    )
      .lean()
      .exec();
    return jobs.map((job) => String(job._id));
  }
  // A job accepts applications only while it is Published, not being deleted, before its deadline and
  // owned by an Active enterprise.
  async findOpenPublishedById(
    id: string,
    now: Date,
  ): Promise<JobPostingDoc | null> {
    const job = await JobPosting.findOne({
      _id: id,
      status: 'published',
      deleting: { $ne: true },
      ...notExpired(now),
    }).exec();
    if (!job) return null;
    return (await this.isEnterpriseActive(String(job.enterprise_id))) ? job : null;
  }
  async isEnterpriseActive(enterpriseId: string): Promise<boolean> {
    return (await Enterprise.exists({ _id: enterpriseId, status: 'active', is_deleted: { $ne: true } }).exec()) !== null;
  }
  async findActiveEnterpriseIds(): Promise<string[]> {
    const rows = await Enterprise.find({ status: 'active', is_deleted: { $ne: true } }, { _id: 1 }).lean().exec();
    return rows.map((row) => String(row._id));
  }
  async exists(id: string): Promise<boolean> {
    return (await JobPosting.exists({ _id: id }).exec()) !== null;
  }
  // Atomically flags the job as being deleted so no application can be accepted while the count is checked.
  async markDeleting(id: string): Promise<JobPostingDoc | null> {
    return JobPosting.findOneAndUpdate(
      { _id: id, deleting: { $ne: true } },
      { $set: { deleting: true } },
      { returnDocument: 'after' },
    ).exec();
  }
  async clearDeleting(id: string): Promise<void> {
    await JobPosting.updateOne({ _id: id }, { $unset: { deleting: 1 } }).exec();
  }
  async hasApplications(id: string): Promise<boolean> {
    return (await Application.exists({ job_id: id }).exec()) !== null;
  }
  async countApplicationsByJobIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await Application.aggregate<{ _id: unknown; count: number }>([
      { $match: { job_id: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
      { $group: { _id: '$job_id', count: { $sum: 1 } } },
    ]).exec();
    return new Map(rows.map((row) => [String(row._id), row.count]));
  }
  async recordAudit(event: JobPostingAuditEventData): Promise<void> {
    await JobPostingAuditEvent.create(event);
  }
  // Puts back a job removed by a delete whose audit record could not be written.
  async restore(snapshot: Record<string, unknown>): Promise<void> {
    await JobPosting.replaceOne({ _id: snapshot._id }, snapshot, { upsert: true }).exec();
  }
  async findBySlug(
    slug: string,
    exceptId?: string,
  ): Promise<JobPostingDoc | null> {
    return JobPosting.findOne({
      slug,
      ...(exceptId ? { _id: { $ne: exceptId } } : {}),
    }).exec();
  }
  async update(
    id: string,
    input: UpdateJobPosting,
    slug?: string,
    expiresAt?: Date,
  ): Promise<JobPostingDoc | null> {
    const unset = this.clearFields(input);
    const rest = this.withoutDeadline(input);
    return JobPosting.findByIdAndUpdate(
      id,
      {
        $set: { ...this.fields(rest), ...(slug ? { slug } : {}), ...(expiresAt ? { expires_at: expiresAt } : {}) },
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { returnDocument: 'after' },
    ).exec();
  }
  async delete(id: string): Promise<boolean> {
    return (await JobPosting.deleteOne({ _id: id }).exec()).deletedCount === 1;
  }
  async list(
    query: JobPostingListQuery,
    options: { publicOnly: boolean; enterpriseId?: string; activeEnterpriseIds?: string[] },
  ): Promise<{ items: JobPostingDoc[]; total: number }> {
    const filter: Record<string, unknown> = {
      // Public listing: Published, not being deleted, before the deadline and owned by an Active enterprise.
      // The conditions sit in $and so they combine with the enterprise_id filter and the search $or.
      ...(options.publicOnly
        ? {
            status: 'published',
            deleting: { $ne: true },
            $and: [notExpired(new Date()), { enterprise_id: { $in: options.activeEnterpriseIds ?? [] } }],
          }
        : {}),
      ...(options.enterpriseId ?? query.enterprise_id ? { enterprise_id: options.enterpriseId ?? query.enterprise_id } : {}),
      ...(query.location
        ? {
            location: new RegExp(
              query.location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'i',
            ),
          }
        : {}),
      ...(query.employment_type
        ? { employment_type: query.employment_type }
        : {}),
      ...(query.level ? { level: query.level } : {}),
    };
    if (query.search) {
      const pattern = new RegExp(
        query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      filter.$or = [
        { title: pattern },
        { description: pattern },
        { location: pattern },
      ];
    }
    const field = query.sort_by === 'created_at' ? 'createdAt' : query.sort_by;
    const direction = query.sort_order === 'asc' ? 1 : -1;
    const [items, total] = await Promise.all([
      JobPosting.find(filter)
        .sort({ [field]: direction, _id: direction })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      JobPosting.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }
  // The deadline is stored as an instant, so callers pass it separately after normalising it.
  private withoutDeadline<T extends { expires_at?: unknown }>(input: T): Omit<T, 'expires_at'> {
    const copy = { ...input };
    delete copy.expires_at;
    return copy;
  }
  private fields(
    input: Omit<CreateJobPosting | UpdateJobPosting, 'expires_at'>,
  ): Partial<JobPostingData> {
    const result: Partial<JobPostingData> = {};
    if (input.title !== undefined) result.title = input.title;
    if (input.location !== undefined && input.location !== null)
      result.location = input.location;
    if (input.employment_type !== undefined && input.employment_type !== null)
      result.employment_type = input.employment_type;
    if (input.salary_min !== undefined && input.salary_min !== null)
      result.salary_min = input.salary_min;
    if (input.salary_max !== undefined && input.salary_max !== null)
      result.salary_max = input.salary_max;
    if (input.salary_negotiable !== undefined)
      result.salary_negotiable = input.salary_negotiable;
    if (input.currency !== undefined) result.currency = input.currency;
    if (input.level !== undefined && input.level !== null) result.level = input.level;
    if (input.description !== undefined && input.description !== null)
      result.description = input.description;
    if (input.requirements !== undefined && input.requirements !== null)
      result.requirements = input.requirements;
    if (input.benefits !== undefined && input.benefits !== null)
      result.benefits = input.benefits;
    if (input.openings !== undefined && input.openings !== null)
      result.openings = input.openings;
    return result;
  }
  private clearFields(input: UpdateJobPosting): Partial<Record<'salary_min' | 'salary_max' | 'level' | 'openings', 1>> {
    const result: Partial<Record<'salary_min' | 'salary_max' | 'level' | 'openings', 1>> = {};
    if (input.salary_min === null) result.salary_min = 1;
    if (input.salary_max === null) result.salary_max = 1;
    if (input.level === null) result.level = 1;
    if (input.openings === null) result.openings = 1;
    return result;
  }
}
export const jobPostingsRepository = new JobPostingsRepository();