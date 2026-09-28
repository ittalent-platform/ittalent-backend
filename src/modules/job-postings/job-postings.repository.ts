import { JobPosting, type JobPostingDoc } from '../../models/job-posting.model.js';
import { PUBLIC_JOB_VISIBILITY } from './job-postings.constants.js';

// Only fields meant for the public are loaded; the list uses a lighter projection than the detail.
const LIST_FIELDS =
  'enterprise_id title location employment_type level salary_min salary_max currency createdAt';
const DETAIL_FIELDS = `${LIST_FIELDS} description requirements benefits openings deadline`;

export type PublicJobListDoc = Pick<
  JobPostingDoc,
  | '_id'
  | 'enterprise_id'
  | 'title'
  | 'location'
  | 'employment_type'
  | 'level'
  | 'salary_min'
  | 'salary_max'
  | 'currency'
  | 'createdAt'
>;

export type PublicJobDetailDoc = PublicJobListDoc &
  Pick<JobPostingDoc, 'description' | 'requirements' | 'benefits' | 'openings' | 'deadline'>;

export class JobPostingsRepository {
  async findPublicPage(
    page: number,
    limit: number,
  ): Promise<{ items: PublicJobListDoc[]; total: number }> {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      JobPosting.find(PUBLIC_JOB_VISIBILITY)
        .select(LIST_FIELDS)
        // Newest first; _id breaks ties so pagination stays deterministic.
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean<PublicJobListDoc[]>()
        .exec(),
      JobPosting.countDocuments(PUBLIC_JOB_VISIBILITY).exec(),
    ]);

    return { items, total };
  }

  async findPublicById(id: string): Promise<PublicJobDetailDoc | null> {
    return JobPosting.findOne({ _id: id, ...PUBLIC_JOB_VISIBILITY })
      .select(DETAIL_FIELDS)
      .lean<PublicJobDetailDoc>()
      .exec();
  }
}

export const jobPostingsRepository = new JobPostingsRepository();