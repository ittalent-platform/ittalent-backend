import { Enterprise } from '../../models/enterprise.model.js';
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

export class JobPostingsRepository {
  async create(
    userId: string,
    enterpriseId: string,
    input: CreateJobPosting,
    slug: string,
  ): Promise<JobPostingDoc> {
    return new JobPosting({
      enterprise_id: enterpriseId,
      posted_by_user_id: userId,
      title: input.title,
      slug,
      ...this.fields(input),
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
  // A job accepts applications only while it is Published and not past its expiry date.
  async findOpenPublishedById(
    id: string,
    now: Date,
  ): Promise<JobPostingDoc | null> {
    return JobPosting.findOne({
      _id: id,
      status: 'published',
      $or: [
        { expires_at: { $exists: false } },
        { expires_at: null },
        { expires_at: { $gt: now } },
      ],
    }).exec();
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
  ): Promise<JobPostingDoc | null> {
    const unset = this.clearFields(input);
    return JobPosting.findByIdAndUpdate(
      id,
      {
        $set: { ...this.fields(input), ...(slug ? { slug } : {}) },
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
    options: { publicOnly: boolean; enterpriseId?: string },
  ): Promise<{ items: JobPostingDoc[]; total: number }> {
    const filter: Record<string, unknown> = {
      ...(options.publicOnly ? { status: 'published' } : {}),
      ...(query.status && !options.publicOnly ? { status: query.status } : {}),
      ...(options.enterpriseId ? { enterprise_id: options.enterpriseId } : {}),
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
  private fields(
    input: CreateJobPosting | UpdateJobPosting,
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
    if (input.status !== undefined) result.status = input.status;
    if (input.expires_at !== undefined && input.expires_at !== null)
      result.expires_at = new Date(input.expires_at);
    if (input.status === 'published') result.published_at = new Date();
    if (input.status === 'archived') result.archived_at = new Date();
    return result;
  }
  private clearFields(input: UpdateJobPosting): Partial<Record<
    'location' | 'employment_type' | 'salary_min' | 'salary_max' | 'level' |
    'description' | 'requirements' | 'benefits' | 'openings' | 'expires_at',
    1
  >> {
    const result: Partial<Record<
      'location' | 'employment_type' | 'salary_min' | 'salary_max' | 'level' |
      'description' | 'requirements' | 'benefits' | 'openings' | 'expires_at',
      1
    >> = {};
    if (input.location === null) result.location = 1;
    if (input.employment_type === null) result.employment_type = 1;
    if (input.salary_min === null) result.salary_min = 1;
    if (input.salary_max === null) result.salary_max = 1;
    if (input.level === null) result.level = 1;
    if (input.description === null) result.description = 1;
    if (input.requirements === null) result.requirements = 1;
    if (input.benefits === null) result.benefits = 1;
    if (input.openings === null) result.openings = 1;
    if (input.expires_at === null) result.expires_at = 1;
    return result;
  }
}
export const jobPostingsRepository = new JobPostingsRepository();
